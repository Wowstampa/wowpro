import {NextResponse} from 'next/server';

import {getCurrentProfile} from '@/lib/auth';
import {getAccessibleQuote, listQuoteMessages, toSummary} from '@/lib/quotes';

export async function GET(_request: Request, {params}: {params: Promise<{quoteId: string}>}) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({error: 'Non autenticato.'}, {status: 401});
  const {quoteId} = await params;
  const quote = await getAccessibleQuote(profile, quoteId);
  if (!quote) return NextResponse.json({error: 'Preventivo non trovato.'}, {status: 404});
  return NextResponse.json({quote: toSummary(quote), messages: await listQuoteMessages(quoteId, profile)}, {headers: {'Cache-Control': 'no-store'}});
}
