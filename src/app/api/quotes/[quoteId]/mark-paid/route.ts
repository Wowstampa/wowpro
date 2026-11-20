import {NextResponse} from 'next/server';

import {getCurrentProfile} from '@/lib/auth';
import {getDraftOrderState, markOrderAsPaid} from '@/lib/integrations/shopify';
import {QUOTE_COLUMNS, addQuoteEvent, getAccessibleQuote, isQuoteTeam, notifyQuote, toSummary} from '@/lib/quotes';
import {createAdminClient} from '@/lib/supabase/admin.server';

// The account manager confirms the bank transfer: the Shopify order is marked as paid and the quote closes.
export async function POST(_request: Request, {params}: {params: Promise<{quoteId: string}>}) {
  const profile = await getCurrentProfile();
  if (!profile || !isQuoteTeam(profile)) return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});
  const {quoteId} = await params;
  const quote = await getAccessibleQuote(profile, quoteId);
  if (!quote) return NextResponse.json({error: 'Preventivo non trovato.'}, {status: 404});
  if (quote.status !== 'quoted' || !quote.order_name || !quote.draft_order_id) return NextResponse.json({error: 'Non c’è un ordine in attesa di bonifico.'}, {status: 409});
  try {
    const state = await getDraftOrderState(quote.draft_order_id);
    if (!state) throw new Error('Ordine non trovato su Shopify.');
    if (state.cancelled) return NextResponse.json({error: 'L’ordine è stato annullato su Shopify.'}, {status: 409});
    if (!state.paid) await markOrderAsPaid(state.orderId);
    const now = new Date().toISOString();
    const {data, error} = await createAdminClient().from('quote_requests').update({status: 'paid', paid_at: now, updated_at: now}).eq('id', quote.id).eq('status', 'quoted').select(QUOTE_COLUMNS).maybeSingle();
    if (error) throw error;
    if (data) {
      await addQuoteEvent(quote.id, profile.id, `Bonifico ricevuto · ordine ${quote.order_name} pagato. Il tuo ordine è in lavorazione.`);
      await notifyQuote({quote, actor: profile, subject: 'Bonifico ricevuto', message: `Abbiamo ricevuto il tuo bonifico: l’ordine ${quote.order_name} è in lavorazione.`}).catch((notifyError) => console.error('[Quote notify]', notifyError));
    }
    return NextResponse.json({quote: toSummary((data || quote) as never)});
  } catch (error) {
    console.error('[Quote mark paid]', error);
    const message = error instanceof Error && /access|scope|permission/i.test(error.message) ? 'L’app Shopify non ha ancora il permesso di modificare gli ordini.' : `Impossibile aggiornare l’ordine su Shopify${error instanceof Error ? ` (${error.message.slice(0, 160)})` : ''}.`;
    return NextResponse.json({error: message}, {status: 502});
  }
}
