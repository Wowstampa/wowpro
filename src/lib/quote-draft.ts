import 'server-only';

import {createHmac, timingSafeEqual} from 'node:crypto';

import {getWowproClient} from '@/lib/integrations/airtable';
import {createQuoteDraftOrder, deleteDraftOrder} from '@/lib/integrations/shopify';
import {createAdminClient} from '@/lib/supabase/admin.server';

type Line = {variantId: string; title: string; quantity: number; unitPrice: number; properties?: Array<{name: string; value: string}>};

// Permanent, unguessable download links for quote files: they can be opened from the Shopify order without logging in.
function fileToken(messageId: string) {
  return createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY || 'wowpro').update(`quote-file:${messageId}`).digest('hex').slice(0, 32);
}
export function verifyFileToken(messageId: string, token: string) {
  const expected = Buffer.from(fileToken(messageId));
  const given = Buffer.from(token || '');
  return expected.length === given.length && timingSafeEqual(expected, given);
}
export function quoteFileLink(messageId: string) {
  const origin = (process.env.NEXT_PUBLIC_APP_URL || 'https://wowpro.it').replace(/\/$/, '');
  return `${origin}/api/f/${messageId}?t=${fileToken(messageId)}`;
}

async function quoteAttachments(quoteId: string) {
  const {data: files} = await createAdminClient().from('quote_messages').select('id,body,file_name,file_path').eq('quote_id', quoteId).not('file_path', 'is', null).order('created_at');
  return (files || []).filter((file) => file.body !== 'Contabile del bonifico');
}

// All file links of a quote, as Shopify attributes.
export async function quoteFileLinks(quoteId: string) {
  return (await quoteAttachments(quoteId)).slice(0, 30).map((file) => {
    const design = /^File della grafica (\S+)/.exec(file.body || '')?.[1];
    return {name: `File${design ? ` grafica ${design}` : ''}: ${(file.file_name || 'file').slice(0, 80)}`, value: quoteFileLink(file.id)};
  });
}

// Adds one "File" property per attachment: design files go on the line linked to that design, the client's own files on the first line.
async function withFileProperties(quoteId: string, lines: Line[]) {
  const attachments = await quoteAttachments(quoteId);
  if (!attachments.length) return lines;
  const result = lines.map((line) => ({...line, properties: [...(line.properties || [])]}));
  for (const file of attachments) {
    const design = /^File della grafica (\S+)/.exec(file.body || '')?.[1];
    const targets = design ? result.filter((line) => line.properties.some((property) => property.name === 'Grafica' && property.value === design)) : [];
    for (const line of targets.length ? targets : result.slice(0, 1)) {
      if (line.properties.length < 40) line.properties.push({name: `File${design ? ' grafica' : ''}: ${(file.file_name || 'file').slice(0, 80)}`, value: quoteFileLink(file.id)});
    }
  }
  return result;
}

// Creates (or replaces) the Shopify draft order of a quote, with the file links on its lines.
export async function publishQuoteDraft({quote, lines, shipping, note}: {quote: {id: string; public_id: string; company_id: string}; lines: Line[]; shipping: number; note: string}) {
  const admin = createAdminClient();
  const {data: company} = await admin.from('companies').select('airtable_record_id,shopify_customer_id').eq('id', quote.company_id).maybeSingle();
  const {data: row} = await admin.from('quote_requests').select('draft_order_id,requester:requested_by(email)').eq('id', quote.id).maybeSingle();
  let email = ((Array.isArray(row?.requester) ? row?.requester[0] : row?.requester) as {email?: string} | null)?.email || '';
  let customerId = company?.shopify_customer_id || null;
  if (company?.airtable_record_id) {
    try { const client = await getWowproClient(company.airtable_record_id); email = client.fields.email_login || email; customerId = client.fields.shopify_customer_id || customerId; } catch { /* CRM optional. */ }
  }
  const draft = await createQuoteDraftOrder({quoteId: quote.id, publicId: quote.public_id, email, customerId, lines: await withFileProperties(quote.id, lines), shipping, note});
  if (row?.draft_order_id) await deleteDraftOrder(row.draft_order_id);
  return {...draft, replaced: !!row?.draft_order_id};
}

// New files arrived after the quote was sent (e.g. the approved design): the draft order is rebuilt with the same prices.
export async function refreshQuoteDraftFiles(quoteId: string) {
  const admin = createAdminClient();
  const {data: quote} = await admin.from('quote_requests').select('id,public_id,company_id,status,order_name,offer,draft_order_id').eq('id', quoteId).maybeSingle();
  const offer = quote?.offer as {lines: Line[]; shipping: number; note: string; validUntil: string | null} | null;
  if (!quote || quote.status !== 'quoted' || quote.order_name || !quote.draft_order_id || !offer?.lines?.length) return;
  if (offer.validUntil && offer.validUntil < new Date().toISOString().slice(0, 10)) return;
  const draft = await publishQuoteDraft({quote, lines: offer.lines, shipping: offer.shipping || 0, note: offer.note || ''});
  await admin.from('quote_requests').update({draft_order_id: draft.id, invoice_url: draft.invoiceUrl, quote_total: draft.total, currency: draft.currency, updated_at: new Date().toISOString()}).eq('id', quote.id);
}
