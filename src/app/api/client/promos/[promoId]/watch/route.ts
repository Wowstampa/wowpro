import {NextResponse} from 'next/server';

import {getCurrentProfile} from '@/lib/auth';
import {readStore, writeStore} from '@/lib/promos';

// "Avvisami": the client gets the launch email for this promo even if promo emails are off.
export async function POST(_request: Request, {params}: {params: Promise<{promoId: string}>}) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active' || profile.role !== 'client') return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});
  const {promoId} = await params;
  const store = await readStore();
  const promo = store.promos.find((item) => item.id === promoId);
  if (!promo) return NextResponse.json({error: 'Promo non trovata.'}, {status: 404});
  const watching = promo.watchers.includes(profile.id);
  promo.watchers = watching ? promo.watchers.filter((id) => id !== profile.id) : [...promo.watchers, profile.id];
  await writeStore(store);
  return NextResponse.json({watching: !watching});
}
