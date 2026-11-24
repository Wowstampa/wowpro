import {NextResponse} from 'next/server';
import {z} from 'zod';

import {getCurrentProfile} from '@/lib/auth';
import {refundExpress, requestExpress} from '@/lib/express';
import {getAccessibleQuote, isQuoteTeam, toSummary} from '@/lib/quotes';

const schema = z.object({action: z.enum(['request', 'refund']), reason: z.string().trim().max(500).default('')});

// Express shipping paid with credits: the client requests it, the team can refund it.
export async function POST(request: Request, {params}: {params: Promise<{quoteId: string}>}) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({error: 'Non autenticato.'}, {status: 401});
  const {quoteId} = await params;
  const quote = await getAccessibleQuote(profile, quoteId);
  if (!quote) return NextResponse.json({error: 'Preventivo non trovato.'}, {status: 404});
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({error: 'Azione non valida.'}, {status: 400});
  if (parsed.data.action === 'request' && profile.role !== 'client') return NextResponse.json({error: 'Solo il cliente può richiederla.'}, {status: 403});
  if (parsed.data.action === 'refund' && !isQuoteTeam(profile)) return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});
  try {
    const updated = parsed.data.action === 'request' ? await requestExpress(profile, quote) : await refundExpress(profile, quote, parsed.data.reason);
    return NextResponse.json({quote: toSummary((updated || quote) as never)});
  } catch (error) {
    console.error('[Quote express]', error);
    return NextResponse.json({error: error instanceof Error ? error.message : 'Operazione non riuscita.'}, {status: 400});
  }
}
