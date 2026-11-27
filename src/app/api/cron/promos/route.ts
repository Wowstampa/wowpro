import {NextResponse} from 'next/server';

import {runPromoJobs} from '@/lib/promos';

export const maxDuration = 120;

// Every 15 minutes: WOWPRO tags on Shopify customers, launch emails, opening promos to everyone at the public date.
export async function GET() {
  try { return NextResponse.json(await runPromoJobs(), {headers: {'Cache-Control': 'no-store'}}); }
  catch (error) { console.error('[Promo jobs]', error); return NextResponse.json({error: 'Promo non aggiornate.'}, {status: 500}); }
}
