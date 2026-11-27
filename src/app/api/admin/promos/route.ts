import {NextResponse} from 'next/server';

import {getCurrentProfile} from '@/lib/auth';
import {promoSchema, toPromo} from '@/lib/promo-input';
import {readStore, saveShopifyDiscount, writeStore} from '@/lib/promos';

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active' || !['admin', 'staff'].includes(profile.role)) return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});
  const parsed = promoSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({error: parsed.error.issues[0]?.message || 'Dati promo non validi.'}, {status: 400});
  const store = await readStore();
  if (store.promos.some((promo) => promo.code.toUpperCase() === parsed.data.code.toUpperCase())) return NextResponse.json({error: 'Esiste già una promo con questo codice.'}, {status: 409});
  const promo = toPromo(parsed.data, null);
  try { await saveShopifyDiscount(promo, store); } catch (error) { promo.shopify.error = error instanceof Error ? error.message : 'Errore Shopify'; console.error('[Promo Shopify]', error); }
  store.promos.unshift(promo);
  await writeStore(store);
  return NextResponse.json({promo}, {status: 201});
}
