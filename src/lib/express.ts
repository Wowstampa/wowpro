import 'server-only';

import type {CurrentProfile} from '@/lib/auth';
import {getWowproClient, updateWowproClient} from '@/lib/integrations/airtable';
import {getDraftOrderState, setOrderExpress} from '@/lib/integrations/shopify';
import {refreshQuoteDraftFiles} from '@/lib/quote-draft';
import {QUOTE_COLUMNS, addQuoteEvent, notifyQuote, type QuoteOffer} from '@/lib/quotes';
import {createAdminClient} from '@/lib/supabase/admin.server';

export const EXPRESS_COST = 2_000;

type QuoteRow = {id: string; public_id: string; company_id: string; status: string; order_name: string | null; draft_order_id?: string | null; offer: QuoteOffer | null};
type Actor = {id: string | null; role: CurrentProfile['role']};

const stampNow = () => new Intl.DateTimeFormat('it-IT', {day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome'}).format(new Date());

async function liveOrder(quote: QuoteRow) {
  if (!quote.order_name || !quote.draft_order_id) return null;
  const state = await getDraftOrderState(quote.draft_order_id);
  return state && !state.cancelled ? state : null;
}

async function companyRecord(companyId: string) {
  const {data: company} = await createAdminClient().from('companies').select('airtable_record_id').eq('id', companyId).maybeSingle();
  if (!company?.airtable_record_id) throw new Error('Account cliente non configurato.');
  return company.airtable_record_id as string;
}

// Spends 2.000 credits (included first, then extra) with a ledger entry; restored if the CRM update fails.
async function charge(quote: QuoteRow, actorId: string, label: string) {
  const recordId = await companyRecord(quote.company_id);
  const client = await getWowproClient(recordId, {fresh: true});
  const included = Number(client.fields.crediti_inclusi_residui || 0);
  const extra = Number(client.fields.crediti_extra_residui || 0);
  if (included + extra < EXPRESS_COST) throw new Error(`Crediti insufficienti: la spedizione express richiede ${EXPRESS_COST.toLocaleString('it-IT')} crediti, ne hai ${(included + extra).toLocaleString('it-IT')}.`);
  const usedIncluded = Math.min(included, EXPRESS_COST);
  const usedExtra = EXPRESS_COST - usedIncluded;
  const description = `Spedizione express · ${label}`;
  const stamp = Date.now();
  const admin = createAdminClient();
  const rows = [
    ...(usedIncluded ? [{company_id: quote.company_id, bucket: 'included' as const, amount: -usedIncluded, description, idempotency_key: `express-${quote.id}-${stamp}-i`, created_by: actorId}] : []),
    ...(usedExtra ? [{company_id: quote.company_id, bucket: 'extra' as const, amount: -usedExtra, description, idempotency_key: `express-${quote.id}-${stamp}-e`, created_by: actorId}] : []),
  ];
  const {data: ledger, error} = await admin.from('credit_transactions').insert(rows).select('id');
  if (error) throw new Error('Registro crediti non disponibile.');
  try {
    await updateWowproClient(recordId, {crediti_inclusi_residui: included - usedIncluded, crediti_extra_residui: extra - usedExtra});
  } catch {
    await admin.from('credit_transactions').delete().in('id', (ledger || []).map((row) => row.id));
    throw new Error('Impossibile scalare i crediti. Riprova.');
  }
  return {included: usedIncluded, extra: usedExtra};
}

// The client asks for express shipping: while requesting the quote, or later on the confirmed order.
export async function requestExpress(profile: CurrentProfile, quote: QuoteRow) {
  if (quote.offer?.express && !quote.offer.express.refundedAt) throw new Error('Hai già richiesto la spedizione express.');
  if (!['new', 'in_review', 'quoted', 'paid'].includes(quote.status)) throw new Error('Questa richiesta non è più modificabile.');
  const order = await liveOrder(quote);
  if (quote.order_name && !order) throw new Error('L’ordine non è più attivo.');
  if (order?.fulfilled) throw new Error('L’ordine è già stato spedito.');

  const used = await charge(quote, profile.id, order ? `ordine ${quote.order_name}` : `preventivo ${quote.public_id}`);
  const admin = createAdminClient();
  const requestedAt = new Date().toISOString();
  const offer = {...(quote.offer || {}), express: {requestedAt, credits: EXPRESS_COST, ...used, refundedAt: null}} as QuoteOffer;
  const {data: updated} = await admin.from('quote_requests').update({offer, updated_at: requestedAt}).eq('id', quote.id).select(QUOTE_COLUMNS).single();
  try {
    if (order) await setOrderExpress(order.orderId, true, `⚡ SPEDIZIONE EXPRESS richiesta dal cliente il ${stampNow()} (${EXPRESS_COST.toLocaleString('it-IT')} crediti WOWPRO)`);
    else if (quote.status === 'quoted') await refreshQuoteDraftFiles(quote.id);
  } catch (error) { console.error('[Express tag]', error); }
  const where = order ? `l’ordine ${quote.order_name}` : `il preventivo ${quote.public_id}`;
  await addQuoteEvent(quote.id, profile.id, `Spedizione express richiesta per ${where}: ${EXPRESS_COST.toLocaleString('it-IT')} crediti scalati.`);
  await notifyQuote({quote, actor: profile, subject: '⚡ Spedizione express richiesta', message: `Il cliente ha richiesto la spedizione express per ${where} (${EXPRESS_COST.toLocaleString('it-IT')} crediti già scalati).${order ? ' L’ordine su Shopify ha il tag «SPEDIZIONE EXPRESS».' : ' Tienine conto nel preventivo: l’ordine avrà il tag «SPEDIZIONE EXPRESS».'} Se non è possibile, rimborsa i crediti dal portale.`}).catch((error) => console.error('[Quote notify]', error));
  return updated;
}

// Gives the credits back: by the team (express not possible) or automatically when the quote is cancelled or expires.
export async function refundExpress(actor: Actor, quote: QuoteRow, reason: string, {silent = false} = {}) {
  const express = quote.offer?.express;
  if (!express || express.refundedAt) { if (silent) return null; throw new Error('Non c’è una spedizione express da rimborsare.'); }
  const recordId = await companyRecord(quote.company_id);
  const client = await getWowproClient(recordId, {fresh: true});
  const admin = createAdminClient();
  const description = `Rimborso spedizione express · ${quote.order_name ? `ordine ${quote.order_name}` : `preventivo ${quote.public_id}`}`;
  const rows = [
    ...(express.included ? [{company_id: quote.company_id, bucket: 'included' as const, amount: express.included, description, created_by: actor.id}] : []),
    ...(express.extra ? [{company_id: quote.company_id, bucket: 'extra' as const, amount: express.extra, description, created_by: actor.id}] : []),
  ];
  const {data: ledger, error} = await admin.from('credit_transactions').insert(rows).select('id');
  if (error) throw new Error('Registro crediti non disponibile.');
  try {
    await updateWowproClient(recordId, {crediti_inclusi_residui: Number(client.fields.crediti_inclusi_residui || 0) + express.included, crediti_extra_residui: Number(client.fields.crediti_extra_residui || 0) + express.extra});
  } catch {
    await admin.from('credit_transactions').delete().in('id', (ledger || []).map((row) => row.id));
    throw new Error('Impossibile rimborsare i crediti. Riprova.');
  }
  const {data: fresh} = await admin.from('quote_requests').select('offer').eq('id', quote.id).maybeSingle();
  const offer = {...((fresh?.offer as QuoteOffer | null) || quote.offer || {}), express: {...express, refundedAt: new Date().toISOString()}} as QuoteOffer;
  const {data: updated} = await admin.from('quote_requests').update({offer, updated_at: new Date().toISOString()}).eq('id', quote.id).select(QUOTE_COLUMNS).single();
  try {
    const order = await liveOrder(quote);
    if (order) await setOrderExpress(order.orderId, false, '');
    else if (quote.status === 'quoted') await refreshQuoteDraftFiles(quote.id);
  } catch (error) { console.error('[Express untag]', error); }
  await addQuoteEvent(quote.id, actor.id, `Spedizione express annullata: ${express.credits.toLocaleString('it-IT')} crediti rimborsati.${reason ? ` ${reason}` : ''}`);
  await notifyQuote({quote, actor: {...actor, id: actor.id || ''} as CurrentProfile, subject: 'Crediti della spedizione express restituiti', message: `Ti abbiamo restituito ${express.credits.toLocaleString('it-IT')} crediti della spedizione express (${quote.order_name ? `ordine ${quote.order_name}` : `preventivo ${quote.public_id}`}).${reason ? `\n\n${reason}` : ''}`}).catch((error) => console.error('[Quote notify]', error));
  return updated;
}

// Automatic refund when a quote with express shipping is closed without being shipped.
export async function refundExpressOnClose(quoteId: string, reason: string) {
  const {data: quote} = await createAdminClient().from('quote_requests').select('id,public_id,company_id,status,order_name,draft_order_id,offer').eq('id', quoteId).maybeSingle();
  if (!quote) return;
  await refundExpress({id: null, role: 'admin'}, quote as QuoteRow, reason, {silent: true}).catch((error) => console.error('[Express auto refund]', error));
}
