import {NextResponse} from 'next/server';
import {z} from 'zod';

import {getCurrentProfile} from '@/lib/auth';
import {searchCatalog, type CatalogProduct} from '@/lib/integrations/shopify';

const schema = z.object({rows: z.array(z.object({key: z.string().max(400), handle: z.string().trim().max(300).default(''), title: z.string().trim().max(160), variant: z.string().trim().max(160).default('')})).max(300)});
const norm = (value: string) => value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
// "https://wowstampa.com/products/striscione-pvc?variant=1" → "striscione-pvc"
const handleOf = (value: string) => (value.match(/\/products\/([^/?#]+)/)?.[1] || value).trim().toLowerCase();

function pickVariant(product: CatalogProduct, wanted: string) {
  if (product.variants.length === 1) return product.variants[0];
  const target = norm(wanted);
  if (!target) return null;
  return product.variants.find((variant) => norm(variant.title) === target) || product.variants.find((variant) => norm(variant.title).includes(target)) || null;
}

// Price list import: each CSV product is linked to the Shopify catalog (by handle or by exact name), for photo and price.
export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active' || !['admin', 'staff'].includes(profile.role)) return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({error: 'Richiesta non valida.'}, {status: 400});
  const rows = parsed.data.rows;
  try {
    const byHandle = new Map<string, CatalogProduct>();
    const handles = [...new Set(rows.map((row) => row.handle ? handleOf(row.handle) : '').filter(Boolean))];
    for (let index = 0; index < handles.length; index += 20) for (const product of await searchCatalog('', {handles: handles.slice(index, index + 20)})) byHandle.set(product.handle.toLowerCase(), product);
    const byTitle = new Map<string, CatalogProduct | null>();
    const matches: Record<string, {productId: string; variantId: string; imageUrl: string | null; title: string; variantTitle: string; price: number} | null> = {};
    for (const row of rows) {
      let product = row.handle ? byHandle.get(handleOf(row.handle)) || null : null;
      if (!product && !row.handle) {
        const key = norm(row.title);
        if (!byTitle.has(key)) byTitle.set(key, (await searchCatalog(row.title).catch(() => [])).find((item) => norm(item.title) === key) || null);
        product = byTitle.get(key) || null;
      }
      const variant = product ? pickVariant(product, row.variant) : null;
      // Without a recognisable variant the product is still linked (photo; price applied to any of its variants).
      matches[row.key] = product ? {productId: product.id, variantId: variant?.id || '', imageUrl: product.imageUrl, title: product.title, variantTitle: variant?.title || '', price: variant?.price ?? product.variants[0]?.price ?? 0} : null;
    }
    return NextResponse.json({matches});
  } catch (error) {
    console.error('[Price list catalog match]', error);
    return NextResponse.json({error: 'Catalogo Shopify non raggiungibile: i prodotti restano voci libere.'}, {status: 502});
  }
}
