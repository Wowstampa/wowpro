import {PageHeader} from '@/components/app-shell';
import {ClientDashboard, type DashboardTodo} from '@/components/client-dashboard';
import {requireProfile} from '@/lib/auth';
import {getWowproClient} from '@/lib/integrations/airtable';
import {hasActiveSubscription} from '@/lib/access';
import {getConversationCompany} from '@/lib/support';
import {createAdminClient} from '@/lib/supabase/admin.server';
import {createClient} from '@/lib/supabase/server';

// Client workspace: compact welcome, what needs attention, requests/orders/credits, guide and account manager.
export default async function DashboardPage() {
  const profile = await requireProfile(['client']);
  const supabase = await createClient();
  const [{data: company}, {data: requests}, {data: quotes}] = await Promise.all([
    supabase.from('companies').select('name,airtable_record_id').eq('id', profile.company_id || '').maybeSingle(),
    createAdminClient().from('graphic_requests').select('id,public_id,title,status').eq('company_id', profile.company_id || '').in('status', ['new', 'in_progress', 'review']).order('created_at', {ascending: false}).limit(50),
    createAdminClient().from('quote_requests').select('id,public_id,status,order_name,offer,items').eq('company_id', profile.company_id || '').in('status', ['new', 'in_review', 'quoted']).order('created_at', {ascending: false}).limit(50),
  ]);
  const team = profile.company_id ? await getConversationCompany(profile.company_id).catch(() => null) : null;
  let included = 0; let extra = 0; let manager = team?.manager?.name || ''; const active = await hasActiveSubscription(profile.company_id);
  if (company?.airtable_record_id) {
    try {
      const airtable = await getWowproClient(company.airtable_record_id);
      included = Number(airtable.fields.crediti_inclusi_residui || 0);
      extra = Number(airtable.fields.crediti_extra_residui || 0);
      manager = manager || airtable.fields.account_manager_nome || '';
    } catch { /* The dashboard remains available when Airtable is unreachable. */ }
  }
  const credits = included + extra;
  const name = company?.name || profile.full_name || 'cliente';
  const today = new Date().toISOString().slice(0, 10);

  const working = (requests || []).filter((request) => request.status !== 'review');
  const toApprove = (requests || []).filter((request) => request.status === 'review');
  const openQuotes = (quotes || []).filter((quote) => quote.status !== 'quoted');
  const toPay = (quotes || []).filter((quote) => quote.status === 'quoted' && !quote.order_name && !((quote.offer as {validUntil?: string} | null)?.validUntil && (quote.offer as {validUntil: string}).validUntil < today));
  const awaitingTransfer = (quotes || []).filter((quote) => quote.status === 'quoted' && quote.order_name);
  const quoteTitle = (quote: {items: unknown}) => ((quote.items as Array<{productTitle?: string}> | null) || []).map((item) => item.productTitle).filter(Boolean).join(', ') || 'Preventivo';
  const todos: DashboardTodo[] = [
    ...toApprove.map((request) => ({href: `/dashboard/richieste?r=${request.id}`, tag: 'Bozza da approvare', title: request.title, label: request.public_id})),
    ...toPay.map((quote) => ({href: `/dashboard/richieste?tab=preventivi&q=${quote.id}`, tag: 'Preventivo da pagare', title: quoteTitle(quote), label: quote.public_id})),
  ].slice(0, 4);

  const orders = toPay.length ? {value: toPay.length, label: toPay.length === 1 ? 'Preventivo da pagare' : 'Preventivi da pagare', alert: true} : awaitingTransfer.length ? {value: awaitingTransfer.length, label: 'In attesa di bonifico', alert: false} : {value: 0, label: 'Pagamenti in sospeso', alert: false};

  return <><PageHeader eyebrow={`WOWPRO · ${name}`} title={active ? 'Dashboard' : 'Benvenuto'} action={<div className="credit-chip"><i /> <strong>{number(credits)}</strong> crediti</div>} />
    <ClientDashboard active={active} credits={{included, extra}} manager={{id: team?.manager?.id || null, name: manager}} name={name} orders={orders} requests={{open: working.length + openQuotes.length, toApprove: toApprove.length}} todos={todos} />
  </>;
}

function number(value: number) { return new Intl.NumberFormat('it-IT').format(value); }
