import {NextResponse} from 'next/server';

import {getCurrentProfile} from '@/lib/auth';
import {promoSchema, toPromo} from '@/lib/promo-input';
import {deleteShopifyDiscount, readStore, saveShopifyDiscount, writeStore} from '@/lib/promos';
import {REQUEST_FILES_BUCKET} from '@/lib/request-files';
import {createAdminClient} from '@/lib/supabase/admin.server';

async function team() {
  const profile = await getCurrentProfile();
  return profile && profile.status === 'active' && ['admin', 'staff'].includes(profile.role);
}

export async function PATCH(request: Request, {params}: {params: Promise<{promoId: string}>}) {
  if (!(await team())) return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});
  const {promoId} = await params;
  const parsed = promoSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({error: parsed.error.issues[0]?.message || 'Dati promo non validi.'}, {status: 400});
  const store = await readStore();
  const index = store.promos.findIndex((promo) => promo.id === promoId);
  if (index < 0) return NextResponse.json({error: 'Promo non trovata.'}, {status: 404});
  if (store.promos.some((promo) => promo.id !== promoId && promo.code.toUpperCase() === parsed.data.code.toUpperCase())) return NextResponse.json({error: 'Esiste già una promo con questo codice.'}, {status: 409});
  const previous = store.promos[index];
  const promo = toPromo(parsed.data, previous);
  // Switching to a manual code: the discount the portal had created is removed.
  if (previous.shopify.mode === 'auto' && promo.shopify.mode === 'manual') { try { await deleteShopifyDiscount(previous); } catch (error) { console.error('[Promo Shopify delete]', error); } promo.shopify.discountId = null; }
  try { await saveShopifyDiscount(promo, store); } catch (error) { promo.shopify.error = error instanceof Error ? error.message : 'Errore Shopify'; console.error('[Promo Shopify]', error); }
  store.promos[index] = promo;
  await writeStore(store);
  return NextResponse.json({promo});
}

export async function DELETE(_request: Request, {params}: {params: Promise<{promoId: string}>}) {
  if (!(await team())) return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});
  const {promoId} = await params;
  const store = await readStore();
  const promo = store.promos.find((item) => item.id === promoId);
  if (!promo) return NextResponse.json({ok: true});
  try { await deleteShopifyDiscount(promo); } catch (error) { console.error('[Promo Shopify delete]', error); return NextResponse.json({error: 'Non riesco a eliminare lo sconto su Shopify. Riprova.'}, {status: 502}); }
  if (promo.image) await createAdminClient().storage.from(REQUEST_FILES_BUCKET).remove([promo.image.path]);
  store.promos = store.promos.filter((item) => item.id !== promoId);
  await writeStore(store);
  return NextResponse.json({ok: true});
}
