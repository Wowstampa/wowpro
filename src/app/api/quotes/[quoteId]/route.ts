import {NextResponse} from 'next/server';

import {getCurrentProfile} from '@/lib/auth';
import {getAccessibleQuote, listQuoteMessages, syncQuoteWithShopify, toSummary} from '@/lib/quotes';

export async function GET(_request: Request, {params}: {params: Promise<{quoteId: string}>}) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({error: 'Non autenticato.'}, {status: 401});
  const {quoteId} = await params;
  const found = await getAccessibleQuote(profile, quoteId);
  if (!found) return NextResponse.json({error: 'Preventivo non trovato.'}, {status: 404});
  const quote = await syncQuoteWithShopify(found, {includePaid: true});
  return NextResponse.json({quote: toSummary(quote), messages: await listQuoteMessages(quoteId, profile)}, {headers: {'Cache-Control': 'no-store'}});
}
