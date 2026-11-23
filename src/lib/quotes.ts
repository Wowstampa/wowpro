import 'server-only';

import type {CurrentProfile} from '@/lib/auth';
import {escapeHtml, sendEmail} from '@/lib/email';
import {deleteDraftOrder, getDraftOrderState} from '@/lib/integrations/shopify';
import {getConversationCompany} from '@/lib/support';
import {createAdminClient} from '@/lib/supabase/admin.server';

export type QuoteStatus = 'new' | 'in_review' | 'quoted' | 'paid' | 'cancelled';
export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {new: 'Inviata', in_review: 'In valutazione', quoted: 'Preventivo pronto', paid: 'Pagato', cancelled: 'Annullata'};

export type QuoteItem = {productId: string; variantId: string; productTitle: string; variantTitle: string; imageUrl: string | null; quantity: number; note: string; listPrice: number | null; options?: Array<{name: string; value: string}>; graphicRequest?: {id: string; publicId: string; title: string} | null};
export type QuoteReceipt = {messageId: string; name: string; uploadedAt: string};
export type QuoteOffer = {receipt?: QuoteReceipt | null; lines: Array<{variantId: string; title: string; quantity: number; unitPrice: number; properties?: Array<{name: string; value: string}>}>; shipping: number; note: string; validUntil: string | null};
export type QuoteSummary = {id: string; publicId: string; kind: 'quote' | 'order'; status: QuoteStatus; companyName: string; requesterName: string; items: QuoteItem[]; notes: string; neededBy: string | null; offer: QuoteOffer | null; invoiceUrl: string | null; awaitingPayment: boolean; expired: boolean; validUntil: string | null; total: number | null; currency: string; createdAt: string; quotedAt: string | null; paidAt: string | null; orderName: string | null};
export type QuoteMessage = {id: string; kind: 'comment' | 'event'; body: string; createdAt: string; authorName: string; fromClient: boolean; mine: boolean; file: {name: string; size: number} | null};

type Row = {id: string; public_id: string; company_id: string; kind: 'quote' | 'order'; status: QuoteStatus; items: QuoteItem[]; notes: string; needed_by: string | null; offer: QuoteOffer | null; invoice_url: string | null; draft_order_id?: string | null; quote_total: number | null; currency: string; created_at: string; quoted_at: string | null; paid_at: string | null; order_name: string | null; companies?: {name: string} | {name: string}[] | null; requester?: {full_name: string | null; email: string} | {full_name: string | null; email: string}[] | null};

export const QUOTE_COLUMNS = 'id,public_id,company_id,kind,status,items,notes,needed_by,offer,invoice_url,draft_order_id,quote_total,currency,created_at,quoted_at,paid_at,order_name,companies(name),requester:requested_by(full_name,email)';
const one = <T,>(value: T | T[] | null | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;

export const QUOTE_VALIDITY_DAYS = 15;
const today = () => new Date().toISOString().slice(0, 10);
// A quote without an order can no longer be paid after its validity date (the date itself is still valid).
export function isExpired(row: {status: string; order_name: string | null; offer: QuoteOffer | null}) {
  return row.status === 'quoted' && !row.order_name && !!row.offer?.validUntil && row.offer.validUntil < today();
}

export function toSummary(row: Row): QuoteSummary {
  const requester = one(row.requester);
  return {
    id: row.id, publicId: row.public_id, kind: row.kind, status: row.status, companyName: one(row.companies)?.name || 'Cliente', requesterName: requester?.full_name || requester?.email || 'Cliente',
    items: row.items || [], notes: row.notes, neededBy: row.needed_by, offer: row.offer, invoiceUrl: row.status === 'quoted' && !isExpired(row) ? row.invoice_url : null, awaitingPayment: row.status === 'quoted' && !!row.order_name, expired: isExpired(row), validUntil: row.offer?.validUntil || null,
    total: row.quote_total === null ? null : Number(row.quote_total), currency: row.currency, createdAt: row.created_at, quotedAt: row.quoted_at, paidAt: row.paid_at, orderName: row.order_name,
  };
}

const lastSync = new Map<string, number>();

// Checks the draft order on Shopify: a checkout paid by bank transfer creates the order before the money arrives.
// Paid quotes are checked only when opened (includePaid), so an order cancelled later on Shopify is picked up too.
export async function syncQuoteWithShopify<T extends Row>(row: T, {includePaid = false} = {}): Promise<T> {
  if (!row.draft_order_id || !(row.status === 'quoted' || (includePaid && row.status === 'paid'))) return row;
  if (Date.now() - (lastSync.get(row.id) || 0) < 15_000) return row;
  lastSync.set(row.id, Date.now());
  try {
    const state = await getDraftOrderState(row.draft_order_id);
    if (!state) return row;
    const admin = createAdminClient();
    const now = new Date().toISOString();
    if (state.cancelled) {
      const {data} = await admin.from('quote_requests').update({status: 'cancelled', order_name: state.orderName, updated_at: now}).eq('id', row.id).in('status', ['quoted', 'paid']).select(QUOTE_COLUMNS).maybeSingle<T>();
      if (!data) return row;
      await addQuoteEvent(row.id, null, `L’ordine ${state.orderName} è stato annullato.`);
      await notifyQuote({quote: row, actor: {id: '', role: 'admin'} as CurrentProfile, subject: 'Ordine annullato', message: `L’ordine ${state.orderName} legato a questo preventivo è stato annullato. Per qualsiasi dubbio scrivi al tuo account manager dal portale.`}).catch((error) => console.error('[Quote notify]', error));
      return data;
    }
    if (row.status === 'paid') return row;
    if (state.paid) {
      const {data} = await admin.from('quote_requests').update({status: 'paid', paid_at: now, order_name: state.orderName, updated_at: now}).eq('id', row.id).eq('status', 'quoted').select(QUOTE_COLUMNS).maybeSingle<T>();
      if (data) { await addQuoteEvent(row.id, null, `Pagamento ricevuto · ordine ${state.orderName}. Il tuo ordine è in lavorazione.`); await notifyQuotePaid(row, state.orderName); return data; }
      return row;
    }
    if (row.order_name) return row;
    const {data} = await admin.from('quote_requests').update({order_name: state.orderName, invoice_url: state.statusPageUrl || row.invoice_url, updated_at: now}).eq('id', row.id).is('order_name', null).select(QUOTE_COLUMNS).maybeSingle<T>();
    if (!data) return row;
    await addQuoteEvent(row.id, null, `Ordine ${state.orderName} creato con pagamento tramite bonifico: in attesa dell’accredito.`);
    await notifyQuote({quote: row, actor: {id: '', role: 'client'} as CurrentProfile, subject: 'Preventivo accettato: in attesa di bonifico', message: `Il cliente ha accettato il preventivo e ha scelto il bonifico. Ordine ${state.orderName}: quando ricevi l’accredito segna l’ordine come pagato su Shopify.`}).catch((error) => console.error('[Quote notify]', error));
    return data;
  } catch (error) {
    console.error('[Quote sync]', error);
    return row;
  }
}

// When a design is approved, its files reach the print quotes that were waiting for it.
export async function attachApprovedGraphicToQuotes(graphicId: string) {
  const admin = createAdminClient();
  const {data: graphic} = await admin.from('graphic_requests').select('id,public_id,status').eq('id', graphicId).maybeSingle();
  if (!graphic || graphic.status !== 'completed') return;
  const {data: quotes} = await admin.from('quote_requests').select('id,public_id,company_id,status,order_name').contains('items', JSON.stringify([{graphicRequest: {id: graphicId}}])).in('status', ['new', 'in_review', 'quoted']).is('order_name', null);
  for (const quote of quotes || []) {
    const {data: already} = await admin.from('quote_messages').select('id').eq('quote_id', quote.id).eq('body', `File della grafica ${graphic.public_id}`).limit(1);
    if (already?.length) continue;
    await attachGraphicFiles(quote.id, graphic);
    await notifyQuote({quote, actor: {id: '', role: 'client'} as CurrentProfile, subject: 'Grafica approvata: file pronti per la stampa', message: `Il cliente ha approvato la grafica ${graphic.public_id}: i file sono allegati al preventivo di stampa ${quote.public_id}.`}).catch((error) => console.error('[Quote notify]', error));
  }
}

// Links the files of a graphic request to a print quote: the latest files from the team once the design is approved.
export async function attachGraphicFiles(quoteId: string, graphic: {id: string; public_id: string; status: string}) {
  const admin = createAdminClient();
  if (graphic.status !== 'completed') {
    await addQuoteEvent(quoteId, null, `Collegato alla grafica ${graphic.public_id}: i file arriveranno con l’approvazione della bozza.`);
    return;
  }
  const {data: files} = await admin.from('request_files').select('storage_path,file_name,size_bytes,uploader:uploaded_by(role)').eq('request_id', graphic.id).eq('customer_visible', true).order('created_at', {ascending: false}).limit(20);
  const fromTeam = (files || []).filter((file) => (one(file.uploader) as {role?: string} | null)?.role !== 'client').slice(0, 5);
  if (fromTeam.length) await admin.from('quote_messages').insert(fromTeam.map((file) => ({quote_id: quoteId, author_id: null, kind: 'comment', body: `File della grafica ${graphic.public_id}`, file_path: file.storage_path, file_name: file.file_name, file_size: file.size_bytes})));
  await addQuoteEvent(quoteId, null, `Collegato alla grafica approvata ${graphic.public_id}${fromTeam.length ? `: ${fromTeam.length === 1 ? 'il file è allegato' : `${fromTeam.length} file allegati`} qui sotto` : ''}.`);
}

// The account manager is told when a client pays a quote online (card or confirmed transfer seen by Shopify).
export async function notifyQuotePaid(quote: {id: string; public_id: string; company_id: string}, orderName: string) {
  await notifyQuote({quote, actor: {id: '', role: 'client'} as CurrentProfile, subject: 'Preventivo pagato', message: `Il cliente ha pagato il preventivo ${quote.public_id}: ordine ${orderName} su Shopify, pronto per la produzione.`}).catch((error) => console.error('[Quote notify]', error));
}

export function isQuoteTeam(profile: CurrentProfile) { return profile.status === 'active' && (profile.role === 'staff' || profile.role === 'admin'); }

// Clients see their company's quotes; admins all; account managers their clients (and clients without a manager).
export async function getAccessibleQuote(profile: CurrentProfile, quoteId: string) {
  if (profile.status !== 'active') return null;
  const {data} = await createAdminClient().from('quote_requests').select(QUOTE_COLUMNS).eq('id', quoteId).maybeSingle<Row>();
  if (!data) return null;
  if (profile.role === 'client') return profile.company_id === data.company_id ? data : null;
  if (profile.role === 'admin') return data;
  if (profile.role === 'staff') {
    const company = await getConversationCompany(data.company_id);
    return !company?.manager || company.manager.id === profile.id ? data : null;
  }
  return null;
}

export async function listQuotes(profile: CurrentProfile) {
  const admin = createAdminClient();
  let query = admin.from('quote_requests').select(QUOTE_COLUMNS).order('created_at', {ascending: false}).limit(200);
  if (profile.role === 'client') query = query.eq('company_id', profile.company_id || '');
  const {data} = await query.returns<Row[]>();
  let rows = data || [];
  if (profile.role === 'staff') {
    const managers = new Map<string, string | null>();
    for (const companyId of new Set(rows.map((row) => row.company_id))) managers.set(companyId, (await getConversationCompany(companyId))?.manager?.id || null);
    rows = rows.filter((row) => !managers.get(row.company_id) || managers.get(row.company_id) === profile.id);
  }
  rows = await Promise.all(rows.map((row) => syncQuoteWithShopify(row)));
  return rows.map(toSummary);
}

export async function listQuoteMessages(quoteId: string, viewer: CurrentProfile): Promise<QuoteMessage[]> {
  const {data} = await createAdminClient().from('quote_messages').select('id,kind,body,file_name,file_size,file_path,created_at,author_id,author:author_id(full_name,email,role)').eq('quote_id', quoteId).order('created_at');
  return (data || []).map((row) => {
    const author = one(row.author) as {full_name?: string | null; email?: string; role?: string} | null;
    return {id: row.id, kind: row.kind, body: row.body, createdAt: row.created_at, authorName: author?.full_name || author?.email || 'WowStampa', fromClient: author?.role === 'client', mine: row.author_id === viewer.id, file: row.file_path ? {name: row.file_name || 'file', size: Number(row.file_size || 0)} : null};
  });
}

export async function addQuoteEvent(quoteId: string, actorId: string | null, body: string) {
  await createAdminClient().from('quote_messages').insert({quote_id: quoteId, author_id: actorId, kind: 'event', body});
  await createAdminClient().from('quote_requests').update({updated_at: new Date().toISOString()}).eq('id', quoteId);
}

export function newQuotePublicId() {
  const now = new Date();
  const stamp = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `PV-${stamp}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
}

// Emails the other side: the account manager (admins when there is none) or the client's users.
export async function notifyQuote({quote, actor, subject, message}: {quote: {id: string; public_id: string; company_id: string}; actor: CurrentProfile; subject: string; message: string}) {
  const admin = createAdminClient();
  const origin = (process.env.NEXT_PUBLIC_APP_URL || 'https://wowpro.it').replace(/\/$/, '');
  let recipients: Array<{id: string; email: string}> = [];
  let link = `${origin}/dashboard/richieste?tab=preventivi&q=${quote.id}`;
  if (actor.role === 'client') {
    const manager = (await getConversationCompany(quote.company_id))?.manager;
    if (manager) recipients = [manager];
    else recipients = ((await admin.from('profiles').select('id,email').eq('role', 'admin').eq('status', 'active')).data || []);
    link = `${origin}/admin/preventivi?q=${quote.id}`;
  } else {
    recipients = ((await admin.from('profiles').select('id,email').eq('role', 'client').eq('status', 'active').eq('company_id', quote.company_id)).data || []);
  }
  for (const recipient of recipients.filter((item) => item.id !== actor.id)) {
    const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#0a0d15"><p style="font-size:12px;letter-spacing:.08em;color:#11823f;font-weight:bold">WOWPRO · PREVENTIVO ${escapeHtml(quote.public_id)}</p><h2 style="margin:0 0 12px">${escapeHtml(subject)}</h2><blockquote style="margin:0 0 20px;padding:12px 16px;border-left:4px solid #1db65b;background:#f6f9fb;color:#3a4556">${escapeHtml(message).replace(/\n/g, '<br>')}</blockquote><a href="${link}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#1db65b;color:#fff;text-decoration:none;font-weight:bold">Apri il preventivo</a></div>`;
    try { await sendEmail({to: recipient.email, subject: `${subject} · ${quote.public_id}`, html, text: `${subject}\n\n${message}\n\nApri il preventivo: ${link}`}); } catch (error) { console.error('[Quote email]', error); }
  }
}

// Daily housekeeping for quotes waiting for payment: one reminder after a few days, then expiry.
export async function runQuoteReminders() {
  const admin = createAdminClient();
  const {data: rows} = await admin.from('quote_requests').select(QUOTE_COLUMNS).eq('status', 'quoted').is('order_name', null).limit(500).returns<Row[]>();
  const now = Date.now();
  let reminded = 0; let expired = 0;
  for (const row of rows || []) {
    const team = {id: '', role: 'admin'} as CurrentProfile;
    if (isExpired(row)) {
      const {data: marked} = await admin.from('quote_messages').select('id').eq('quote_id', row.id).eq('kind', 'event').like('body', 'Preventivo scaduto%').limit(1);
      if (marked?.length) continue;
      if (row.draft_order_id) await deleteDraftOrder(row.draft_order_id);
      await admin.from('quote_requests').update({invoice_url: null, draft_order_id: null, updated_at: new Date().toISOString()}).eq('id', row.id);
      await addQuoteEvent(row.id, null, 'Preventivo scaduto: non è più pagabile. Chiedi un aggiornamento al tuo account manager.');
      await notifyQuote({quote: row, actor: {id: '', role: 'client'} as CurrentProfile, subject: 'Preventivo scaduto', message: `Il preventivo ${row.public_id} è scaduto senza pagamento. Se il cliente è ancora interessato, aggiorna i prezzi e reinvialo.`}).catch((error) => console.error('[Quote notify]', error));
      expired += 1;
      continue;
    }
    if (!row.quoted_at || now - new Date(row.quoted_at).getTime() < 3 * 86_400_000) continue;
    const {data: sent} = await admin.from('quote_messages').select('id').eq('quote_id', row.id).eq('kind', 'event').like('body', 'Promemoria%').gt('created_at', row.quoted_at).limit(1);
    if (sent?.length) continue;
    const until = row.offer?.validUntil ? new Intl.DateTimeFormat('it-IT', {day: 'numeric', month: 'long'}).format(new Date(`${row.offer.validUntil}T12:00:00`)) : null;
    await addQuoteEvent(row.id, null, `Promemoria inviato: il preventivo è in attesa di conferma${until ? ` (valido fino al ${until})` : ''}.`);
    await notifyQuote({quote: row, actor: team, subject: 'Il tuo preventivo ti aspetta', message: `Il preventivo ${row.public_id}${row.quote_total !== null ? ` di ${new Intl.NumberFormat('it-IT', {style: 'currency', currency: row.currency || 'EUR'}).format(Number(row.quote_total))}` : ''} è pronto e in attesa di conferma${until ? `: è valido fino al ${until}` : ''}. Puoi pagarlo con carta o bonifico dal portale.`}).catch((error) => console.error('[Quote notify]', error));
    reminded += 1;
  }
  return {reminded, expired};
}
