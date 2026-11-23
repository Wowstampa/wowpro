import {NextResponse} from 'next/server';

import {getCurrentProfile} from '@/lib/auth';
import {addQuoteEvent, ensureGraphicFiles, getAccessibleQuote, isQuoteTeam, syncQuoteFilesToShopify} from '@/lib/quotes';

// Team action: collects the approved design files and writes all file links on the Shopify draft or order.
export async function POST(_request: Request, {params}: {params: Promise<{quoteId: string}>}) {
  const profile = await getCurrentProfile();
  if (!profile || !isQuoteTeam(profile)) return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});
  const {quoteId} = await params;
  const quote = await getAccessibleQuote(profile, quoteId);
  if (!quote) return NextResponse.json({error: 'Preventivo non trovato.'}, {status: 404});
  try {
    await ensureGraphicFiles(quote.id);
    const target = await syncQuoteFilesToShopify(quote.id);
    if (target === 'none') return NextResponse.json({error: 'Non c’è ancora un ordine o una bozza su Shopify: invia prima il preventivo.'}, {status: 409});
    await addQuoteEvent(quote.id, profile.id, target === 'order' ? `Link ai file aggiornati nell’ordine ${quote.order_name || ''}.`.replace(' .', '.') : 'Link ai file aggiornati nella bozza d’ordine.');
    return NextResponse.json({ok: true, target});
  } catch (error) {
    console.error('[Quote files sync]', error);
    return NextResponse.json({error: `Aggiornamento su Shopify non riuscito${error instanceof Error ? ` (${error.message.slice(0, 160)})` : ''}.`}, {status: 502});
  }
}
