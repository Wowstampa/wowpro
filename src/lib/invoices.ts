import 'server-only';

import {escapeHtml, sendEmail} from '@/lib/email';
import {listWowproClients} from '@/lib/integrations/airtable';
import {findOrderCustomer} from '@/lib/integrations/shopify';
import {filterByPreference} from '@/lib/notification-prefs';
import {REQUEST_FILES_BUCKET, ensureRequestFilesBucket, fileExtension} from '@/lib/request-files';
import {createAdminClient} from '@/lib/supabase/admin.server';

// Client invoices, posted by the team in a Slack channel and filed automatically under the right client.
// Each company has an index (JSON) next to its PDF files in the private storage bucket.
export type Invoice = {id: string; name: string; size: number; path: string; orderName: string | null; reference: string | null; postedAt: string; postedBy: string | null};

const folder = (companyId: string) => `invoices/${companyId}`;
const indexPath = (companyId: string) => `${folder(companyId)}/index.json`;

export async function listInvoices(companyId: string): Promise<Invoice[]> {
  const {data} = await createAdminClient().storage.from(REQUEST_FILES_BUCKET).download(indexPath(companyId));
  if (!data) return [];
  try { return (JSON.parse(await data.text()) as Invoice[]).sort((a, b) => b.postedAt.localeCompare(a.postedAt)); } catch { return []; }
}

async function saveIndex(companyId: string, invoices: Invoice[]) {
  await createAdminClient().storage.from(REQUEST_FILES_BUCKET).upload(indexPath(companyId), new Blob([JSON.stringify(invoices)], {type: 'application/json'}), {upsert: true, contentType: 'application/json'});
}

export async function getInvoice(companyId: string, invoiceId: string) {
  return (await listInvoices(companyId)).find((invoice) => invoice.id === invoiceId) || null;
}

const digits = (value: string | null | undefined) => (value || '').replace(/\D/g, '');

// Works out the client from what the team wrote with the file: order number, quote code, VAT number or client name.
export async function matchInvoiceClient(text: string): Promise<{companyId: string; companyName: string; orderName: string | null; how: string} | null> {
  const admin = createAdminClient();
  const companyByRecord = async (recordId: string) => (await admin.from('companies').select('id,name').eq('airtable_record_id', recordId).maybeSingle()).data;

  // 1. Quote code (PV-…) or order number of a portal quote.
  const quoteCode = text.match(/\bPV-\d{6}-[A-Z0-9]{4}\b/i)?.[0];
  const orderName = text.match(/#\s?([A-Z]{0,4}\d{4,})\b/i)?.[1] || text.match(/\bordine\s+n?[°.:]?\s*#?([A-Z]{0,4}\d{4,})\b/i)?.[1] || null;
  if (quoteCode) {
    const {data} = await admin.from('quote_requests').select('company_id,order_name,companies(name)').eq('public_id', quoteCode.toUpperCase()).maybeSingle();
    if (data) return {companyId: data.company_id, companyName: (Array.isArray(data.companies) ? data.companies[0] : data.companies)?.name || 'Cliente', orderName: data.order_name, how: `preventivo ${quoteCode.toUpperCase()}`};
  }
  if (orderName) {
    const name = `#${orderName.toUpperCase()}`;
    const {data} = await admin.from('quote_requests').select('company_id,companies(name)').eq('order_name', name).maybeSingle();
    if (data) return {companyId: data.company_id, companyName: (Array.isArray(data.companies) ? data.companies[0] : data.companies)?.name || 'Cliente', orderName: name, how: `ordine ${name}`};
    try {
      const order = await findOrderCustomer(name);
      if (order) {
        const clients = await listWowproClients();
        const client = clients.find(({fields}) => (order.customerId && digits(fields.shopify_customer_id) === order.customerId) || (order.email && (fields.email_login || '').toLowerCase() === order.email));
        const company = client ? await companyByRecord(client.id) : null;
        if (company) return {companyId: company.id, companyName: company.name, orderName: order.name, how: `ordine ${order.name}`};
      }
    } catch (error) { console.error('[Invoice match order]', error); }
  }

  // 2. VAT number (11 digits) or the client's name/code in the message.
  const clients = (await listWowproClients()).filter(({fields}) => !fields.archiviato);
  const vat = text.match(/\b(?:IT)?(\d{11})\b/i)?.[1];
  const byVat = vat ? clients.find(({fields}) => digits(fields.fatt_partita_iva) === vat) : undefined;
  const lower = text.toLocaleLowerCase('it-IT');
  const byName = byVat ? undefined : clients.find(({fields}) => [fields.cliente_id, fields.ragione_sociale, fields.fatt_ragione_sociale].some((value) => value && value.trim().length >= 4 && lower.includes(value.trim().toLocaleLowerCase('it-IT'))));
  const client = byVat || byName;
  if (client) {
    const company = await companyByRecord(client.id);
    if (company) return {companyId: company.id, companyName: company.name, orderName: orderName ? `#${orderName.toUpperCase()}` : null, how: byVat ? `P.IVA ${vat}` : 'nome del cliente'};
  }
  return null;
}

// Stores the PDF and adds it to the client's invoices (idempotent on the Slack file id).
export async function fileInvoice({companyId, fileId, name, bytes, orderName, reference, postedBy}: {companyId: string; fileId: string; name: string; bytes: ArrayBuffer; orderName: string | null; reference: string | null; postedBy: string | null}) {
  await ensureRequestFilesBucket();
  const invoices = await listInvoices(companyId);
  if (invoices.some((invoice) => invoice.id === fileId)) return {duplicate: true};
  const path = `${folder(companyId)}/${fileId}.${fileExtension(name) || 'pdf'}`;
  const {error} = await createAdminClient().storage.from(REQUEST_FILES_BUCKET).upload(path, bytes, {upsert: true, contentType: 'application/pdf'});
  if (error) throw error;
  await saveIndex(companyId, [...invoices, {id: fileId, name, size: bytes.byteLength, path, orderName, reference, postedAt: new Date().toISOString(), postedBy}]);
  return {duplicate: false};
}

export async function notifyInvoice(companyId: string, invoiceName: string, orderName: string | null) {
  const admin = createAdminClient();
  const origin = (process.env.NEXT_PUBLIC_APP_URL || 'https://wowpro.it').replace(/\/$/, '');
  const {data} = await admin.from('profiles').select('id,email').eq('role', 'client').eq('status', 'active').eq('company_id', companyId);
  const link = `${origin}/dashboard/fatture`;
  for (const recipient of await filterByPreference((data || []) as Array<{id: string; email: string}>, 'preventivi')) {
    const subject = orderName ? `Fattura disponibile per l’ordine ${orderName}` : 'Nuova fattura disponibile';
    const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#0a0d15"><p style="font-size:12px;letter-spacing:.08em;color:#11823f;font-weight:bold">WOWPRO · FATTURE</p><h2 style="margin:0 0 12px">${escapeHtml(subject)}</h2><p style="color:#3a4556">Trovi <b>${escapeHtml(invoiceName)}</b> nel portale, insieme a tutte le tue fatture.</p><a href="${link}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#1db65b;color:#fff;text-decoration:none;font-weight:bold">Vedi le fatture</a></div>`;
    try { await sendEmail({to: recipient.email, subject, html, text: `${subject}\n\n${invoiceName}\n\nVedi le fatture: ${link}`}); } catch (error) { console.error('[Invoice email]', error); }
  }
}
