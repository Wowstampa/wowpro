import {NextResponse} from 'next/server';
import {z} from 'zod';

import {getCurrentProfile} from '@/lib/auth';
import {refundExpressOnClose} from '@/lib/express';
import {deleteDraftOrder} from '@/lib/integrations/shopify';
import {QUOTE_COLUMNS, addQuoteEvent, getAccessibleQuote, isQuoteTeam, notifyQuote, toSummary} from '@/lib/quotes';
import {createAdminClient} from '@/lib/supabase/admin.server';

const schema = z.object({action: z.enum(['review', 'cancel'])});

export async function POST(request: Request, {params}: {params: Promise<{quoteId: string}>}) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({error: 'Non autenticato.'}, {status: 401});
  const {quoteId} = await params;
  const quote = await getAccessibleQuote(profile, quoteId);
  if (!quote) return NextResponse.json({error: 'Preventivo non trovato.'}, {status: 404});
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({error: 'Azione non valida.'}, {status: 400});
  if (quote.status === 'paid' || quote.status === 'cancelled') return NextResponse.json({error: 'Questa richiesta è già chiusa.'}, {status: 409});
  const team = isQuoteTeam(profile);
  if (parsed.data.action === 'cancel' && quote.order_name) return NextResponse.json({error: team ? `C’è già l’ordine ${quote.order_name}: annullalo su Shopify e il preventivo si chiude da solo.` : 'L’ordine è già stato creato: scrivi al tuo account manager per annullarlo.'}, {status: 409});
  if (parsed.data.action === 'review' && !team) return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});

  const admin = createAdminClient();
  const status = parsed.data.action === 'review' ? 'in_review' : 'cancelled';
  if (status === 'cancelled') {
    const {data: row} = await admin.from('quote_requests').select('draft_order_id').eq('id', quote.id).maybeSingle();
    if (row?.draft_order_id) await deleteDraftOrder(row.draft_order_id);
  }
  const {data, error} = await admin.from('quote_requests').update({status, ...(status === 'cancelled' ? {invoice_url: null} : {}), updated_at: new Date().toISOString()}).eq('id', quote.id).select(QUOTE_COLUMNS).single();
  if (error || !data) return NextResponse.json({error: 'Aggiornamento non riuscito.'}, {status: 502});
  const text = status === 'in_review' ? 'Richiesta presa in carico: stiamo preparando il preventivo.' : team ? 'Richiesta annullata da WowStampa.' : 'Richiesta annullata dal cliente.';
  await addQuoteEvent(quote.id, profile.id, text);
  if (status === 'cancelled') await refundExpressOnClose(quote.id, 'La richiesta è stata annullata.');
  await notifyQuote({quote, actor: profile, subject: status === 'in_review' ? 'Stiamo preparando il tuo preventivo' : 'Richiesta annullata', message: text}).catch((notifyError) => console.error('[Quote notify]', notifyError));
  return NextResponse.json({quote: toSummary(data as never)});
}
