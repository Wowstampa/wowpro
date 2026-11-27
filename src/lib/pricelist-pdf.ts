import 'server-only';

import {readFile} from 'node:fs/promises';
import path from 'node:path';

import {PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage} from 'pdf-lib';

import {LEGAL_DETAILS} from '@/lib/legal-details';
import {bestPrice, savingPercent, type PriceList} from '@/lib/pricelist';

const GREEN = rgb(14 / 255, 147 / 255, 69 / 255);
const INK = rgb(10 / 255, 13 / 255, 21 / 255);
const MUTED = rgb(107 / 255, 118 / 255, 134 / 255);
const LINE = rgb(232 / 255, 236 / 255, 241 / 255);
const SOFT = rgb(234 / 255, 246 / 255, 239 / 255);

const money = (value: number) => new Intl.NumberFormat('it-IT', {style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 4}).format(value).replace(/ /g, ' ');
const qty = (value: number) => new Intl.NumberFormat('it-IT', {useGrouping: 'always'} as Intl.NumberFormatOptions).format(value);
const day = (value: string) => new Intl.DateTimeFormat('it-IT', {day: 'numeric', month: 'long', year: 'numeric'}).format(new Date(value.length === 10 ? `${value}T12:00:00` : value));
const safe = (value: string) => value.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[^\x20-\x7e -ÿ€]/g, '');

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const paragraph of safe(text).split(/\n/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) { lines.push(line); line = word; } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

// The client's reserved price list as an A4 PDF, grouped by category.
export async function buildPriceListPdf(list: PriceList, clientName: string) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Listino riservato ${clientName}`); pdf.setAuthor('WowStampa · WOWPRO'); pdf.setCreator('WOWPRO');
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let icon: Awaited<ReturnType<typeof pdf.embedPng>> | null = null;
  try { icon = await pdf.embedPng(await readFile(path.join(process.cwd(), 'public/icons/icon-192.png'))); } catch { /* Text logo only. */ }

  const width = 595.28; const height = 841.89; const margin = 48; const inner = width - margin * 2;
  let page: PDFPage = pdf.addPage([width, height]);
  let y = height - margin;
  const text = (value: string, x: number, top: number, size = 10, font = regular, color = INK) => page.drawText(safe(value), {x, y: top, size, font, color});
  const right = (value: string, x: number, top: number, size = 10, font = regular, color = INK) => text(value, x - font.widthOfTextAtSize(safe(value), size), top, size, font, color);
  const ensure = (space: number) => { if (y - space < margin + 30) { page = pdf.addPage([width, height]); y = height - margin; } };

  if (icon) page.drawImage(icon, {x: margin, y: y - 34, width: 34, height: 34});
  text('WOWPRO', margin + (icon ? 44 : 0), y - 16, 18, bold);
  text('by WowStampa', margin + (icon ? 44 : 0), y - 30, 9, regular, MUTED);
  [LEGAL_DETAILS.company, `P.IVA ${LEGAL_DETAILS.vat}`, `${LEGAL_DETAILS.email} · ${LEGAL_DETAILS.phone}`].forEach((line, index) => right(line, width - margin, y - 8 - index * 11, 8.5, index ? regular : bold, index ? MUTED : INK));
  y -= 70;
  page.drawLine({start: {x: margin, y}, end: {x: width - margin, y}, thickness: 1, color: LINE});
  y -= 30;
  text('LISTINO RISERVATO', margin, y, 9, bold, GREEN);
  text(clientName, margin, y - 22, 20, bold);
  const facts = [list.updatedAt ? `Aggiornato il ${day(list.updatedAt)}` : '', list.validUntil ? `Valido fino al ${day(list.validUntil)}` : '', 'Prezzi unitari IVA esclusa'].filter(Boolean).join('  ·  ');
  text(facts, margin, y - 40, 9, regular, MUTED);
  y -= 58;
  if (list.note) { for (const part of wrap(list.note, regular, 9.5, inner)) { text(part, margin, y, 9.5); y -= 13; } y -= 6; }

  const groups = new Map<string, PriceList['items']>();
  for (const item of list.items) { const key = item.category || 'Altri prodotti'; groups.set(key, [...(groups.get(key) || []), item]); }
  const cols = {desc: margin + 10, tiers: margin + inner * 0.52, best: width - margin - 10};
  for (const [category, items] of groups) {
    ensure(60);
    y -= 6;
    page.drawRectangle({x: margin, y: y - 8, width: inner, height: 24, color: SOFT});
    text(category.toUpperCase(), cols.desc, y, 8.5, bold, GREEN);
    text('PREZZI PER QUANTITÀ', cols.tiers, y, 8, bold, GREEN);
    right('DA', cols.best, y, 8, bold, GREEN);
    y -= 28;
    for (const item of items) {
      const title = wrap(item.title, bold, 10, cols.tiers - cols.desc - 14);
      const detail = [item.detail, item.note, item.minQty > 1 ? `Minimo ${qty(item.minQty)} ${item.unit}` : ''].filter(Boolean).join(' · ');
      const detailLines = detail ? wrap(detail, regular, 8.5, cols.tiers - cols.desc - 14).slice(0, 4) : [];
      const tierLines = item.tiers.map((tier) => `${qty(tier.minQty)}+ ${item.unit}: ${money(tier.price)}`);
      const rowHeight = Math.max(title.length * 13 + detailLines.length * 11, tierLines.length * 12) + 14;
      ensure(rowHeight);
      title.forEach((part, index) => text(part, cols.desc, y - index * 13, 10, bold));
      detailLines.forEach((part, index) => text(part, cols.desc, y - title.length * 13 - index * 11 + 2, 8.5, regular, MUTED));
      tierLines.forEach((part, index) => text(part, cols.tiers, y - index * 12, 9));
      right(`${money(bestPrice(item))}/${item.unit}`, cols.best, y, 10.5, bold, GREEN);
      const saving = savingPercent(item);
      if (item.listPrice) right(`sito ${money(item.listPrice)}${saving ? `  -${saving}%` : ''}`, cols.best, y - 13, 8, regular, MUTED);
      y -= rowHeight;
      page.drawLine({start: {x: margin, y: y + 6}, end: {x: width - margin, y: y + 6}, thickness: 0.6, color: LINE});
    }
  }
  ensure(40);
  y -= 10;
  for (const part of wrap('Prezzi riservati al cliente indicato e non cedibili. Per ordinare chiedi un preventivo dal portale WOWPRO: il prezzo del listino viene applicato in automatico.', regular, 8.5, inner)) { text(part, margin, y, 8.5, regular, MUTED); y -= 11; }
  return await pdf.save();
}
