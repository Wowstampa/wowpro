import 'server-only';

import {z} from 'zod';

import {REQUEST_FILES_BUCKET, ensureRequestFilesBucket} from '@/lib/request-files';
import {createAdminClient} from '@/lib/supabase/admin.server';

// Each client's reserved price list, written by the team. One JSON document per company in storage
// (no database change). Prices are VAT excluded, with optional tiers: per piece (tiers by quantity)
// or per square metre (tiers by total m², the client chooses width and height).

export const tierSchema = z.object({minQty: z.coerce.number().positive().max(1_000_000), price: z.coerce.number().nonnegative().max(1_000_000)});
export const priceItemSchema = z.object({
  id: z.string().trim().min(1).max(60),
  category: z.string().trim().max(60).default(''),
  title: z.string().trim().min(1, 'Ogni prodotto deve avere un nome.').max(160),
  detail: z.string().trim().max(400).default(''),
  productId: z.string().trim().max(120).nullable().default(null),
  variantId: z.string().trim().max(120).nullable().default(null),
  imageUrl: z.string().trim().url().max(600).nullable().default(null),
  listPrice: z.coerce.number().nonnegative().max(1_000_000).nullable().default(null),
  pricing: z.enum(['unit', 'area']).default('unit'),
  // Area pricing: minimum m² billed for each piece (e.g. 1 m² even for a smaller banner).
  minArea: z.coerce.number().nonnegative().max(1000).default(0),
  unit: z.string().trim().max(20).default('pz'),
  tiers: z.array(tierSchema).min(1, 'Ogni prodotto deve avere almeno un prezzo.').max(12),
  minQty: z.coerce.number().int().min(1).max(1_000_000).default(1),
  note: z.string().trim().max(300).default(''),
});
export const priceListSchema = z.object({
  items: z.array(priceItemSchema).max(500),
  validUntil: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]).default(''),
  note: z.string().trim().max(600).default(''),
});
export type PriceItem = z.infer<typeof priceItemSchema>;
export type PriceList = z.infer<typeof priceListSchema> & {updatedAt: string | null; updatedBy: string | null};

export const EMPTY_PRICE_LIST: PriceList = {items: [], validUntil: '', note: '', updatedAt: null, updatedBy: null};
const pathOf = (companyId: string) => `pricelists/${companyId}.json`;

export async function readPriceList(companyId: string): Promise<PriceList> {
  const {data} = await createAdminClient().storage.from(REQUEST_FILES_BUCKET).download(pathOf(companyId));
  if (!data) return {...EMPTY_PRICE_LIST};
  try { return {...EMPTY_PRICE_LIST, ...(JSON.parse(await data.text()) as Partial<PriceList>)}; } catch { return {...EMPTY_PRICE_LIST}; }
}

export async function writePriceList(companyId: string, list: z.infer<typeof priceListSchema>, updatedBy: string) {
  await ensureRequestFilesBucket();
  // Tiers sorted by quantity; the minimum order is never below the first tier.
  const items = list.items.map((item) => {
    const tiers = [...item.tiers].sort((a, b) => a.minQty - b.minQty);
    return item.pricing === 'area' ? {...item, tiers, unit: 'mq', minQty: Math.max(1, Math.round(item.minQty))} : {...item, tiers, minQty: Math.max(item.minQty, tiers[0]?.minQty || 1)};
  });
  const body: PriceList = {...list, items, updatedAt: new Date().toISOString(), updatedBy};
  const {error} = await createAdminClient().storage.from(REQUEST_FILES_BUCKET).upload(pathOf(companyId), new Blob([JSON.stringify(body)], {type: 'application/json'}), {upsert: true, contentType: 'application/json'});
  if (error) throw error;
  return body;
}

// Unit price for a quantity: the best tier reached (the first tier below its minimum).
export function priceFor(item: Pick<PriceItem, 'tiers'>, quantity: number) {
  const tiers = [...item.tiers].sort((a, b) => a.minQty - b.minQty);
  let price = tiers[0]?.price ?? null;
  for (const tier of tiers) if (quantity >= tier.minQty) price = tier.price;
  return price;
}

export const bestPrice = (item: Pick<PriceItem, 'tiers'>) => Math.min(...item.tiers.map((tier) => tier.price));
export function savingPercent(item: Pick<PriceItem, 'tiers' | 'listPrice'>) {
  if (!item.listPrice || item.listPrice <= 0) return null;
  const pct = Math.round((1 - bestPrice(item) / item.listPrice) * 100);
  return pct > 0 ? pct : null;
}

// The reserved price for a product a client puts in a quote (matched by variant, then by product).
export function matchPriceItem(list: PriceList, line: {variantId?: string | null; productId?: string | null; productTitle?: string}) {
  return list.items.find((item) => item.variantId && line.variantId && item.variantId === line.variantId)
    || list.items.find((item) => !item.variantId && item.productId && line.productId && item.productId === line.productId)
    || null;
}

// Area pricing: billed m² per piece from width and height in cm (never below the minimum).
export function areaPerPiece(item: Pick<PriceItem, 'minArea'>, widthCm: number, heightCm: number) {
  const area = (widthCm * heightCm) / 10_000;
  return Math.max(area, item.minArea || 0);
}

// Price per piece for an area-priced product: the m² rate comes from the total m² ordered.
export function areaQuote(item: Pick<PriceItem, 'tiers' | 'minArea'>, widthCm: number, heightCm: number, pieces: number) {
  const area = areaPerPiece(item, widthCm, heightCm);
  const totalArea = area * Math.max(1, pieces);
  const rate = priceFor(item, totalArea) ?? 0;
  return {area, totalArea, rate, perPiece: Math.round(area * rate * 100) / 100, total: Math.round(totalArea * rate * 100) / 100};
}

// Width/height written in a quote line's options ("Base: 200 cm", "Altezza: 100 cm").
export function dimensionsFrom(options: Array<{name: string; value: string}> | undefined) {
  const find = (pattern: RegExp) => { const option = (options || []).find((entry) => pattern.test(entry.name)); const value = option ? Number(option.value.replace(',', '.').replace(/[^\d.]/g, '')) : NaN; return Number.isFinite(value) && value > 0 ? value : null; };
  const width = find(/^(base|larghezza|width)/i); const height = find(/^(altezza|height)/i);
  return width && height ? {width, height} : null;
}
