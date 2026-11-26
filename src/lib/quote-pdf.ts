import 'server-only';

import {readFile} from 'node:fs/promises';
import path from 'node:path';

import {PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage} from 'pdf-lib';

import {WOWSTAMPA_BANK} from '@/lib/bank-details';
import {LEGAL_DETAILS} from '@/lib/legal-details';
import type {QuoteOffer} from '@/lib/quotes';

type QuotePdfInput = {
  publicId: string; createdAt: string; quotedAt: string | null; validUntil: string | null; orderName: string | null;
  client: {name: string; vatNumber: string; address: string; email: string};
  offer: QuoteOffer; total: number | null; currency: string; payUrl: string | null; express: boolean;
};

const GREEN = rgb(14 / 255, 147 / 255, 69 / 255);
const INK = rgb(10 / 255, 13 / 255, 21 / 255);
const MUTED = rgb(107 / 255, 118 / 255, 134 / 255);
const LINE = rgb(232 / 255, 236 / 255, 241 / 255);
const SOFT = rgb(234 / 255, 246 / 255, 239 / 255);

const money = (value: number, currency = 'EUR') => new Intl.NumberFormat('it-IT', {style: 'currency', currency}).format(value).replace(/ /g, ' ');
const day = (value: string) => new Intl.DateTimeFormat('it-IT', {day: 'numeric', month: 'long', year: 'numeric'}).format(new Date(value.length === 10 ? `${value}T12:00:00` : value));
// Standard PDF fonts only cover Latin-1/WinAnsi: anything else is replaced.
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

// A clean A4 quote the client can download or forward to their accounting.
export async function buildQuotePdf(input: QuotePdfInput) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Preventivo ${input.publicId}`); pdf.setAuthor('WowStampa · WOWPRO'); pdf.setCreator('WOWPRO');
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let icon: Awaited<ReturnType<typeof pdf.embedPng>> | null = null;
  try { icon = await pdf.embedPng(await readFile(path.join(process.cwd(), 'public/icons/icon-192.png'))); } catch { /* Text logo only. */ }

  const width = 595.28; const height = 841.89; const margin = 48; const inner = width - margin * 2;
  let page: PDFPage = pdf.addPage([width, height]);
  let y = height - margin;
  const text = (value: string, x: number, top: number, size = 10, font = regular, color = INK) => page.drawText(safe(value), {x, y: top, size, font, color});
  const ensure = (space: number) => { if (y - space < margin + 40) { page = pdf.addPage([width, height]); y = height - margin; } };

  // Header
  if (icon) page.drawImage(icon, {x: margin, y: y - 34, width: 34, height: 34});
  text('WOWPRO', margin + (icon ? 44 : 0), y - 16, 18, bold, INK);
  text('by WowStampa', margin + (icon ? 44 : 0), y - 30, 9, regular, MUTED);
  const company = [LEGAL_DETAILS.company, LEGAL_DETAILS.address, `P.IVA ${LEGAL_DETAILS.vat}`, `${LEGAL_DETAILS.email} · ${LEGAL_DETAILS.phone}`];
  company.forEach((line, index) => { const w = (index ? regular : bold).widthOfTextAtSize(safe(line), 8.5); text(line, width - margin - w, y - 8 - index * 11, 8.5, index ? regular : bold, index ? MUTED : INK); });
  y -= 70;
  page.drawLine({start: {x: margin, y}, end: {x: width - margin, y}, thickness: 1, color: LINE});
  y -= 30;

  // Title and client
  text('PREVENTIVO', margin, y, 9, bold, GREEN);
  text(input.publicId, margin, y - 22, 20, bold);
  const facts = [['Data', day(input.quotedAt || input.createdAt)], ...(input.validUntil ? [['Valido fino al', day(input.validUntil)]] : []), ...(input.orderName ? [['Ordine', input.orderName]] : [])];
  facts.forEach(([label, value], index) => { text(label, margin, y - 44 - index * 14, 9, regular, MUTED); text(value, margin + 82, y - 44 - index * 14, 9, bold); });
  const boxX = width / 2 + 10; const boxW = width - margin - boxX;
  page.drawRectangle({x: boxX, y: y - 84, width: boxW, height: 96, color: rgb(247 / 255, 248 / 255, 250 / 255), borderColor: LINE, borderWidth: 1});
  text('CLIENTE', boxX + 12, y - 4, 8, bold, MUTED);
  const clientLines = [input.client.name, input.client.vatNumber ? `P.IVA ${input.client.vatNumber}` : '', input.client.address, input.client.email].filter(Boolean);
  clientLines.slice(0, 5).forEach((line, index) => { const fitted = wrap(line, index ? regular : bold, 9.5, boxW - 24)[0]; text(fitted, boxX + 12, y - 20 - index * 13, 9.5, index ? regular : bold, index ? MUTED : INK); });
  y -= 118;

  // Lines table
  const cols = {qty: margin + 10, desc: margin + 52, unit: width - margin - 150, total: width - margin - 12};
  page.drawRectangle({x: margin, y: y - 8, width: inner, height: 24, color: SOFT});
  text('Q.TÀ', cols.qty, y, 8, bold, GREEN); text('DESCRIZIONE', cols.desc, y, 8, bold, GREEN);
  text('PREZZO UNIT.', cols.unit, y, 8, bold, GREEN);
  const totalLabel = 'TOTALE'; text(totalLabel, cols.total - bold.widthOfTextAtSize(totalLabel, 8), y, 8, bold, GREEN);
  y -= 30;
  const right = (value: string, x: number, top: number, size = 10, font = regular, color = INK) => text(value, x - font.widthOfTextAtSize(safe(value), size), top, size, font, color);
  for (const line of input.offer.lines) {
    const title = wrap(line.title, bold, 10, cols.unit - cols.desc - 16);
    const specs = (line.properties || []).filter((item) => !/^(File|Grafica)/i.test(item.name)).map((item) => (item.name === 'Descrizione' ? item.value : `${item.name}: ${item.value}`)).join(' · ');
    const specLines = specs ? wrap(specs, regular, 8.5, cols.unit - cols.desc - 16).slice(0, 6) : [];
    const rowHeight = title.length * 13 + specLines.length * 11 + 14;
    ensure(rowHeight);
    text(String(line.quantity), cols.qty, y, 10, bold);
    title.forEach((part, index) => text(part, cols.desc, y - index * 13, 10, bold));
    specLines.forEach((part, index) => text(part, cols.desc, y - title.length * 13 - index * 11 + 2, 8.5, regular, MUTED));
    right(money(line.unitPrice, input.currency), cols.unit + 62, y, 10);
    right(money(line.unitPrice * line.quantity, input.currency), cols.total, y, 10, bold);
    y -= rowHeight;
    page.drawLine({start: {x: margin, y: y + 6}, end: {x: width - margin, y: y + 6}, thickness: 0.6, color: LINE});
  }

  // Totals
  ensure(90);
  y -= 8;
  const totalsX = width - margin - 220;
  const rows: Array<[string, string]> = [['Spedizione', input.offer.shipping ? money(input.offer.shipping, input.currency) : 'Inclusa']];
  if (input.express) rows.push(['Spedizione express', 'Pagata con crediti']);
  rows.forEach(([label, value]) => { text(label, totalsX, y, 9.5, regular, MUTED); right(value, cols.total, y, 9.5); y -= 16; });
  y -= 10;
  page.drawRectangle({x: totalsX - 12, y: y - 12, width: width - margin - totalsX + 12, height: 32, color: INK});
  text('Totale IVA inclusa', totalsX, y, 10, bold, rgb(1, 1, 1));
  right(input.total !== null ? money(input.total, input.currency) : '-', cols.total, y - 1, 13, bold, rgb(1, 1, 1));
  y -= 46;

  if (input.offer.note) {
    const note = wrap(input.offer.note, regular, 9.5, inner);
    ensure(note.length * 13 + 30);
    text('NOTE', margin, y, 8, bold, MUTED); y -= 16;
    note.forEach((part) => { text(part, margin, y, 9.5, regular, INK); y -= 13; });
    y -= 10;
  }

  // Payment
  ensure(110);
  page.drawLine({start: {x: margin, y: y + 4}, end: {x: width - margin, y: y + 4}, thickness: 1, color: LINE});
  y -= 14;
  text('COME PAGARE', margin, y, 8, bold, MUTED); y -= 16;
  text('Con carta: dal portale WOWPRO (Richieste > Preventivi e ordini) oppure dal link del preventivo.', margin, y, 9.5); y -= 14;
  text(`Con bonifico: ${WOWSTAMPA_BANK.beneficiary} · IBAN ${WOWSTAMPA_BANK.iban} · ${WOWSTAMPA_BANK.bank}`, margin, y, 9.5); y -= 14;
  text('Causale: il numero dell\'ordine creato al checkout scegliendo il bonifico.', margin, y, 9.5, regular, MUTED); y -= 14;
  if (input.payUrl) { text('Link di pagamento: ', margin, y, 9.5, bold); text(wrap(input.payUrl, regular, 8.5, inner - 90)[0], margin + 92, y, 8.5, regular, GREEN); }

  // Footer on every page
  const pages = pdf.getPages();
  pages.forEach((item, index) => {
    const footer = safe(`${LEGAL_DETAILS.company} · P.IVA ${LEGAL_DETAILS.vat} · wowpro.it · Pagina ${index + 1} di ${pages.length}`);
    item.drawText(footer, {x: (width - regular.widthOfTextAtSize(footer, 7.5)) / 2, y: 28, size: 7.5, font: regular, color: MUTED});
  });
  return pdf.save();
}
