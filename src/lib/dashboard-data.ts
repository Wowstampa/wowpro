import 'server-only';

export type WorkspaceData = Awaited<ReturnType<typeof getWorkspaceData>>;

import {hasBrandKit, readBrandKit} from '@/lib/brand-kit';
import {getWowproClient} from '@/lib/integrations/airtable';
import {listCustomerOrders, type CustomerOrder} from '@/lib/integrations/shopify';
import {isPrintOrder, orderStage, SHIPMENT_LABELS, type OrderStage} from '@/lib/order-status';
import {draftFromOrder, type ReorderDraft} from '@/lib/reorder';
import {createAdminClient} from '@/lib/supabase/admin.server';

export type DashboardJob = {id: string; href: string; kind: 'grafica' | 'stampa'; publicId: string; title: string; steps: string[]; current: number; label: string; tone: 'info' | 'action' | 'done'; at: string};
export type DashboardOrder = {id: string; name: string; createdAt: string; stage: OrderStage; stageLabel: string; summary: string; imageUrl: string | null; total: number; currency: string; tracking: {label: string; company: string | null; number: string | null; url: string | null} | null; statusPageUrl: string | null; reorder: ReorderDraft};
export type DashboardActivity = {id: string; at: string; text: string; href: string; kind: 'grafica' | 'stampa' | 'messaggio' | 'file'};
export type DashboardCredits = {included: number; extra: number; monthly: number; used: number; renewal: string};
export type DashboardOnboarding = {brandKit: boolean; graphic: boolean; quote: boolean; chat: boolean};

const GRAPHIC_STEPS = ['Ricevuta', 'In lavorazione', 'Bozza pronta', 'Approvata'];
const PRINT_STEPS = ['Richiesta', 'Preventivo', 'Pagamento', 'In produzione', 'Spedito'];
const STAGE_LABELS: Record<OrderStage, string> = {production: 'In produzione', shipped: 'Spedito', delivered: 'Consegnato', cancelled: 'Annullato'};
const one = <T,>(value: T | T[] | null | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;
const today = () => new Date().toISOString().slice(0, 10);

type QuoteRow = {id: string; public_id: string; status: string; order_name: string | null; offer: {validUntil?: string | null} | null; items: Array<{productTitle?: string}> | null; created_at: string; quoted_at: string | null; paid_at: string | null};
const quoteTitle = (quote: {items: Array<{productTitle?: string}> | null}) => (quote.items || []).map((item) => item.productTitle).filter(Boolean).join(', ') || 'Stampa';

// Everything the subscriber workspace shows, read in parallel; each source fails on its own without breaking the page.
export async function getWorkspaceData(companyId: string, recordId: string | null, fallbackEmail: string) {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();

  const [requestsResult, quotesResult, chatResult, kitResult, clientResult] = await Promise.all([
    admin.from('graphic_requests').select('id,public_id,title,status,created_at,updated_at').eq('company_id', companyId).order('updated_at', {ascending: false}).limit(100),
    admin.from('quote_requests').select('id,public_id,status,order_name,offer,items,created_at,quoted_at,paid_at').eq('company_id', companyId).order('created_at', {ascending: false}).limit(100),
    admin.from('support_messages').select('id,author:author_id(role)').eq('company_id', companyId).limit(50),
    readBrandKit(companyId).catch(() => null),
    recordId ? getWowproClient(recordId).catch(() => null) : Promise.resolve(null),
  ]);
  const requests = requestsResult.data || [];
  const quotes = (quotesResult.data || []) as QuoteRow[];

  let orders: CustomerOrder[] = [];
  let ordersAvailable = true;
  try { orders = (await listCustomerOrders({customerId: clientResult?.fields.shopify_customer_id || null, email: clientResult?.fields.email_login || fallbackEmail})).filter(isPrintOrder); } catch (error) { console.error('[Dashboard orders]', error); ordersAvailable = false; }
  const orderByName = new Map(orders.map((order) => [order.name, order]));

  // Jobs in progress: open design requests and print quotes until the order ships.
  const jobs: DashboardJob[] = [];
  for (const request of requests) {
    if (!['new', 'in_progress', 'review'].includes(request.status)) continue;
    const current = request.status === 'new' ? 0 : request.status === 'in_progress' ? 1 : 2;
    jobs.push({id: request.id, href: `/dashboard/richieste?r=${request.id}`, kind: 'grafica', publicId: request.public_id, title: request.title, steps: GRAPHIC_STEPS, current, label: request.status === 'review' ? 'Bozza da approvare' : GRAPHIC_STEPS[current], tone: request.status === 'review' ? 'action' : 'info', at: request.updated_at || request.created_at});
  }
  for (const quote of quotes) {
    const expired = quote.status === 'quoted' && !quote.order_name && !!quote.offer?.validUntil && quote.offer.validUntil < today();
    if (quote.status === 'cancelled' || expired) continue;
    let current = 0; let label = 'Richiesta inviata'; let tone: DashboardJob['tone'] = 'info';
    if (quote.status === 'quoted' && !quote.order_name) { current = 1; label = 'Preventivo da pagare'; tone = 'action'; }
    else if (quote.status === 'quoted') { current = 2; label = 'In attesa di bonifico'; }
    else if (quote.status === 'paid') {
      const order = quote.order_name ? orderByName.get(quote.order_name) : null;
      const stage = order ? orderStage(order) : null;
      // Paid quotes stay in the list while in production; shipped ones move to the orders panel.
      if (stage && stage !== 'production') continue;
      if (!order && (!ordersAvailable || !quote.paid_at || quote.paid_at < since)) continue;
      current = 3; label = 'In produzione';
    } else if (quote.status === 'in_review') label = 'In valutazione';
    jobs.push({id: quote.id, href: `/dashboard/richieste?tab=preventivi&q=${quote.id}`, kind: 'stampa', publicId: quote.public_id, title: quoteTitle(quote), steps: PRINT_STEPS, current, label, tone, at: quote.paid_at || quote.quoted_at || quote.created_at});
  }
  jobs.sort((a, b) => Number(b.tone === 'action') - Number(a.tone === 'action') || b.at.localeCompare(a.at));

  const recentOrders: DashboardOrder[] = orders.filter((order) => !order.cancelled).slice(0, 4).map((order) => {
    const stage = orderStage(order);
    const shipment = order.shipments.find((item) => item.url || item.number) || order.shipments[0] || null;
    const first = order.items[0];
    return {
      id: order.id, name: order.name, createdAt: order.createdAt, stage, stageLabel: STAGE_LABELS[stage], total: order.total, currency: order.currency, statusPageUrl: order.statusPageUrl, imageUrl: first?.imageUrl || null,
      summary: order.items.length > 1 ? `${first?.title} e altri ${order.items.length - 1}` : `${first?.quantity || 1} × ${first?.title || 'Prodotto'}`,
      tracking: shipment ? {label: SHIPMENT_LABELS[shipment.status || ''] || 'Spedito', company: shipment.company, number: shipment.number, url: shipment.url} : null,
      reorder: draftFromOrder(order),
    };
  });

  // Recent activity from the team: request updates, messages and files, quote events.
  const requestIds = requests.map((request) => request.id);
  const quoteIds = quotes.map((quote) => quote.id);
  const titleOf = new Map(requests.map((request) => [request.id, request.public_id]));
  const quoteOf = new Map(quotes.map((quote) => [quote.id, quote.public_id]));
  const [events, messages, files, quoteEvents] = await Promise.all([
    requestIds.length ? admin.from('request_events').select('id,request_id,public_message,created_at').in('request_id', requestIds).not('public_message', 'is', null).gt('created_at', since).order('created_at', {ascending: false}).limit(15) : Promise.resolve({data: []}),
    requestIds.length ? admin.from('request_messages').select('id,request_id,created_at,author:author_id(full_name,role)').in('request_id', requestIds).eq('customer_visible', true).gt('created_at', since).order('created_at', {ascending: false}).limit(15) : Promise.resolve({data: []}),
    requestIds.length ? admin.from('request_files').select('id,request_id,file_name,created_at,uploader:uploaded_by(full_name,role)').in('request_id', requestIds).eq('customer_visible', true).gt('created_at', since).order('created_at', {ascending: false}).limit(15) : Promise.resolve({data: []}),
    quoteIds.length ? admin.from('quote_messages').select('id,quote_id,body,created_at').in('quote_id', quoteIds).eq('kind', 'event').gt('created_at', since).order('created_at', {ascending: false}).limit(15) : Promise.resolve({data: []}),
  ]);
  type Person = {full_name?: string | null; role?: string} | null;
  const activity: DashboardActivity[] = [
    ...((events.data || []) as Array<{id: string; request_id: string; public_message: string; created_at: string}>).map((event) => ({id: `e${event.id}`, at: event.created_at, text: `${titleOf.get(event.request_id)} · ${event.public_message}`, href: `/dashboard/richieste?r=${event.request_id}`, kind: 'grafica' as const})),
    ...((messages.data || []) as Array<{id: string; request_id: string; created_at: string; author: Person | Person[]}>).filter((message) => one(message.author)?.role !== 'client').map((message) => ({id: `m${message.id}`, at: message.created_at, text: `${one(message.author)?.full_name || 'Il team'} ti ha scritto su ${titleOf.get(message.request_id)}`, href: `/dashboard/richieste?r=${message.request_id}`, kind: 'messaggio' as const})),
    ...((files.data || []) as Array<{id: string; request_id: string; file_name: string; created_at: string; uploader: Person | Person[]}>).filter((file) => one(file.uploader)?.role !== 'client').map((file) => ({id: `f${file.id}`, at: file.created_at, text: `${one(file.uploader)?.full_name || 'Il team'} ha caricato ${file.file_name} su ${titleOf.get(file.request_id)}`, href: `/dashboard/richieste?r=${file.request_id}`, kind: 'file' as const})),
    ...((quoteEvents.data || []) as Array<{id: string; quote_id: string; body: string; created_at: string}>).filter((event) => !/^Richiesta (d’ordine|di preventivo) inviata/.test(event.body)).map((event) => ({id: `q${event.id}`, at: event.created_at, text: `${quoteOf.get(event.quote_id)} · ${event.body}`, href: `/dashboard/richieste?tab=preventivi&q=${event.quote_id}`, kind: 'stampa' as const})),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);

  const fields = clientResult?.fields;
  const included = Number(fields?.crediti_inclusi_residui || 0);
  const monthly = Number(fields?.crediti_inclusi_mese || 0);
  const credits: DashboardCredits = {included, extra: Number(fields?.crediti_extra_residui || 0), monthly, used: Math.max(monthly - included, 0), renewal: fields?.data_rinnovo_piano || ''};

  const onboarding: DashboardOnboarding = {
    brandKit: kitResult ? hasBrandKit(kitResult) : true,
    graphic: requests.length > 0,
    quote: quotes.length > 0 || orders.length > 0,
    chat: ((chatResult.data || []) as Array<{author: {role?: string} | Array<{role?: string}> | null}>).some((message) => one(message.author)?.role === 'client'),
  };

  const counts = {open: jobs.filter((job) => job.kind === 'grafica' || job.current < 3).length, action: jobs.filter((job) => job.tone === 'action').length, moving: orders.filter((order) => ['production', 'shipped'].includes(orderStage(order))).length};
  return {counts, jobs: jobs.slice(0, 5), jobsTotal: jobs.length, orders: recentOrders, ordersAvailable, activity, credits, onboarding};
}
