import 'server-only';

import type {CurrentProfile} from '@/lib/auth';
import {getWowproClient, updateWowproClient} from '@/lib/integrations/airtable';
import {getDraftOrderState, setOrderExpress} from '@/lib/integrations/shopify';
import {QUOTE_COLUMNS, addQuoteEvent, notifyQuote, type QuoteOffer} from '@/lib/quotes';
import {createAdminClient} from '@/lib/supabase/admin.server';

export const EXPRESS_COST = 2_000;

type QuoteRow = {id: string; public_id: string; company_id: string; status: string; order_name: string | null; draft_order_id?: string | null; offer: QuoteOffer | null};

async function orderOf(quote: QuoteRow) {
  if (!quote.order_name || !quote.draft_order_id) throw new Error('La spedizione express si richiede quando l’ordine è confermato.');
  const state = await getDraftOrderState(quote.draft_order_id);
  if (!state || state.cancelled) throw new Error('L’ordine non è più attivo.');
  return state;
}

// The client spends credits for express shipping on an order born from a quote: credits first from the included ones, then extra.
export async function requestExpress(profile: CurrentProfile, quote: QuoteRow) {
  if (quote.offer?.express && !quote.offer.express.refundedAt) throw new Error('Hai già richiesto la spedizione express per questo ordine.');
  if (!['quoted', 'paid'].includes(quote.status)) throw new Error('Questo ordine non è più modificabile.');
  const order = await orderOf(quote);
  if (order.fulfilled) throw new Error('L’ordine è già stato spedito.');

  const admin = createAdminClient();
  const {data: company} = await admin.from('companies').select('airtable_record_id').eq('id', quote.company_id).maybeSingle();
  if (!company?.airtable_record_id) throw new Error('Account cliente non configurato.');
  const client = await getWowproClient(company.airtable_record_id, {fresh: true});
  const included = Number(client.fields.crediti_inclusi_residui || 0);
  const extra = Number(client.fields.crediti_extra_residui || 0);
  if (included + extra < EXPRESS_COST) throw new Error(`Crediti insufficienti: la spedizione express richiede ${EXPRESS_COST.toLocaleString('it-IT')} crediti, ne hai ${(included + extra).toLocaleString('it-IT')}.`);
  const usedIncluded = Math.min(included, EXPRESS_COST);
  const usedExtra = EXPRESS_COST - usedIncluded;
  const stamp = Date.now();
  const description = `Spedizione express · ordine ${quote.order_name}`;
  const rows = [
    ...(usedIncluded ? [{company_id: quote.company_id, bucket: 'included' as const, amount: -usedIncluded, description, idempotency_key: `express-${quote.id}-${stamp}-i`, created_by: profile.id}] : []),
    ...(usedExtra ? [{company_id: quote.company_id, bucket: 'extra' as const, amount: -usedExtra, description, idempotency_key: `express-${quote.id}-${stamp}-e`, created_by: profile.id}] : []),
  ];
  const {data: ledger, error: ledgerError} = await admin.from('credit_transactions').insert(rows).select('id');
  if (ledgerError) throw new Error('Registro crediti non disponibile.');
  try {
    await updateWowproClient(company.airtable_record_id, {crediti_inclusi_residui: included - usedIncluded, crediti_extra_residui: extra - usedExtra});
  } catch {
    await admin.from('credit_transactions').delete().in('id', (ledger || []).map((row) => row.id));
    throw new Error('Impossibile scalare i crediti. Riprova.');
  }

  const requestedAt = new Date().toISOString();
  const offer = {...(quote.offer || {}), express: {requestedAt, credits: EXPRESS_COST, included: usedIncluded, extra: usedExtra, refundedAt: null}} as QuoteOffer;
  const {data: updated} = await admin.from('quote_requests').update({offer, updated_at: requestedAt}).eq('id', quote.id).select(QUOTE_COLUMNS).single();
  try {
    await setOrderExpress(order.orderId, true, `⚡ SPEDIZIONE EXPRESS richiesta dal cliente il ${new Intl.DateTimeFormat('it-IT', {day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome'}).format(new Date())} (${EXPRESS_COST.toLocaleString('it-IT')} crediti WOWPRO)`);
  } catch (error) { console.error('[Express tag]', error); }
  await addQuoteEvent(quote.id, profile.id, `Spedizione express richiesta per l’ordine ${quote.order_name}: ${EXPRESS_COST.toLocaleString('it-IT')} crediti scalati.`);
  await notifyQuote({quote, actor: profile, subject: '⚡ Spedizione express richiesta', message: `Il cliente ha richiesto la spedizione express per l’ordine ${quote.order_name} (${EXPRESS_COST.toLocaleString('it-IT')} crediti già scalati). L’ordine su Shopify ha il tag «SPEDIZIONE EXPRESS». Se non è possibile, rimborsa i crediti dal portale.`}).catch((error) => console.error('[Quote notify]', error));
  return updated;
}

// The team gives the credits back when express shipping can't be done.
export async function refundExpress(profile: CurrentProfile, quote: QuoteRow, reason: string) {
  const express = quote.offer?.express;
  if (!express || express.refundedAt) throw new Error('Non c’è una spedizione express da rimborsare.');
  const admin = createAdminClient();
  const {data: company} = await admin.from('companies').select('airtable_record_id').eq('id', quote.company_id).maybeSingle();
  if (!company?.airtable_record_id) throw new Error('Account cliente non configurato.');
  const client = await getWowproClient(company.airtable_record_id, {fresh: true});
  const description = `Rimborso spedizione express · ordine ${quote.order_name}`;
  const rows = [
    ...(express.included ? [{company_id: quote.company_id, bucket: 'included' as const, amount: express.included, description, created_by: profile.id}] : []),
    ...(express.extra ? [{company_id: quote.company_id, bucket: 'extra' as const, amount: express.extra, description, created_by: profile.id}] : []),
  ];
  const {data: ledger, error: ledgerError} = await admin.from('credit_transactions').insert(rows).select('id');
  if (ledgerError) throw new Error('Registro crediti non disponibile.');
  try {
    await updateWowproClient(company.airtable_record_id, {crediti_inclusi_residui: Number(client.fields.crediti_inclusi_residui || 0) + express.included, crediti_extra_residui: Number(client.fields.crediti_extra_residui || 0) + express.extra});
  } catch {
    await admin.from('credit_transactions').delete().in('id', (ledger || []).map((row) => row.id));
    throw new Error('Impossibile rimborsare i crediti. Riprova.');
  }
  const offer = {...(quote.offer || {}), express: {...express, refundedAt: new Date().toISOString()}} as QuoteOffer;
  const {data: updated} = await admin.from('quote_requests').update({offer, updated_at: new Date().toISOString()}).eq('id', quote.id).select(QUOTE_COLUMNS).single();
  try { const order = await orderOf(quote); await setOrderExpress(order.orderId, false, ''); } catch (error) { console.error('[Express untag]', error); }
  await addQuoteEvent(quote.id, profile.id, `Spedizione express non disponibile per l’ordine ${quote.order_name}: ${express.credits.toLocaleString('it-IT')} crediti rimborsati.${reason ? ` ${reason}` : ''}`);
  await notifyQuote({quote, actor: profile, subject: 'Spedizione express non disponibile', message: `Non possiamo spedire in express l’ordine ${quote.order_name}: ti abbiamo restituito ${express.credits.toLocaleString('it-IT')} crediti.${reason ? `\n\n${reason}` : ''}`}).catch((error) => console.error('[Quote notify]', error));
  return updated;
}
