import Link from 'next/link';
import Image from 'next/image';
import {ArrowRight, Coins, MessageSquareText, Package} from 'lucide-react';

import {PageHeader} from '@/components/app-shell';
import {OpenChatButton} from '@/components/support-widget';
import {VideoIntro} from '@/components/video-intro';
import {requireProfile} from '@/lib/auth';
import {getWowproClient} from '@/lib/integrations/airtable';
import {countSubscriptionPayments} from '@/lib/subscription';
import {createAdminClient} from '@/lib/supabase/admin.server';
import {createClient} from '@/lib/supabase/server';

type Todo = {href: string; tag: string; title: string; label: string};

// Client workspace: compact welcome, what needs attention, requests/orders/credits, guide and account manager.
export default async function DashboardPage() {
  const profile = await requireProfile(['client']);
  const supabase = await createClient();
  const [{data: company}, {data: requests}, {data: quotes}] = await Promise.all([
    supabase.from('companies').select('name,airtable_record_id').eq('id', profile.company_id || '').maybeSingle(),
    createAdminClient().from('graphic_requests').select('id,public_id,title,status').eq('company_id', profile.company_id || '').in('status', ['new', 'in_progress', 'review']).order('created_at', {ascending: false}).limit(50),
    createAdminClient().from('quote_requests').select('id,public_id,status,order_name,offer,items').eq('company_id', profile.company_id || '').in('status', ['new', 'in_review', 'quoted']).order('created_at', {ascending: false}).limit(50),
  ]);
  let included = 0; let extra = 0; let manager = ''; let active = false;
  if (company?.airtable_record_id) {
    try {
      const [airtable, payments] = await Promise.all([getWowproClient(company.airtable_record_id), countSubscriptionPayments(company.airtable_record_id).catch(() => 0)]);
      included = Number(airtable.fields.crediti_inclusi_residui || 0);
      extra = Number(airtable.fields.crediti_extra_residui || 0);
      manager = airtable.fields.account_manager_nome || '';
      active = payments > 0;
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
  const todos: Todo[] = [
    ...toApprove.map((request) => ({href: `/dashboard/richieste?r=${request.id}`, tag: 'Bozza da approvare', title: request.title, label: request.public_id})),
    ...toPay.map((quote) => ({href: `/dashboard/richieste?tab=preventivi&q=${quote.id}`, tag: 'Preventivo da pagare', title: quoteTitle(quote), label: quote.public_id})),
  ].slice(0, 4);

  return <><PageHeader eyebrow={`WOWPRO · ${name}`} title="Dashboard" action={<div className="credit-chip"><i /> <strong>{number(credits)}</strong> crediti</div>} /><main className="page-content ws">
    <section className={active ? 'ws-hero' : 'ws-hero ws-hero--intro'}>
      <div className="ws-hero__copy">
        <span className="ws-eyebrow">Il tuo workspace WOWPRO</span>
        <h2>Bentornati, {name}.</h2>
        <p>Grafica, stampa e supporto dedicato. Tutto in un solo posto.</p>
        <div className="ws-hero__actions"><Link className="button button--primary" href="/dashboard/richieste?new=1">Nuova richiesta <ArrowRight size={17} /></Link><Link className="button button--ghost" href="/dashboard/richieste?tab=preventivi&new=quote">Chiedi un preventivo</Link></div>
      </div>
      <div aria-hidden="true" className="ws-hero__art"><Image alt="" fill priority sizes="(max-width: 760px) 0px, 280px" src="/images/wowpro-hero.png" /></div>
    </section>

    {!active ? <>
      <VideoIntro />
      <section className="ws-activate"><div><span className="ws-eyebrow">Abbonamento non attivo</span><h3>Attiva WOWPRO e lavora con il tuo team dedicato</h3><p>12.000 crediti grafici ogni mese, listino riservato, ordini prioritari e un account manager tutto tuo.</p></div><Link className="button button--primary" href="/dashboard/abbonamento">Scopri l’abbonamento <ArrowRight size={17} /></Link></section>
    </> : null}

    {todos.length ? <section className="ws-section">
      <header className="ws-section__head"><h3>Da fare</h3><small>{todos.length === 1 ? '1 elemento' : `${todos.length} elementi`}</small></header>
      <ul className="ws-todo">{todos.map((todo) => <li key={todo.href}><Link href={todo.href}><b>{todo.tag}</b><span>{todo.title}</span><small>{todo.label}</small><ArrowRight size={15} /></Link></li>)}</ul>
    </section> : null}

    <section className="ws-section">
      <header className="ws-section__head"><h3>Il tuo workspace</h3></header>
      <div className="ws-cards">
        <Link className="ws-card" href="/dashboard/richieste"><span className="ws-card__icon"><MessageSquareText size={18} /></span><strong>Le tue richieste</strong><small>Segui i tuoi progetti</small><p><b>{working.length + openQuotes.length}</b> in corso{toApprove.length ? <> · <em>{toApprove.length} da approvare</em></> : null}</p></Link>
        <Link className="ws-card" href="/dashboard/ordini"><span className="ws-card__icon"><Package size={18} /></span><strong>I tuoi ordini</strong><small>Stato e spedizioni</small><p>{toPay.length || awaitingTransfer.length ? <>{toPay.length ? <em>{toPay.length} da pagare</em> : null}{toPay.length && awaitingTransfer.length ? ' · ' : null}{awaitingTransfer.length ? <>{awaitingTransfer.length} in attesa di bonifico</> : null}</> : 'Nessun pagamento in sospeso'}</p></Link>
        <Link className="ws-card" href="/dashboard/crediti"><span className="ws-card__icon"><Coins size={18} /></span><strong>I tuoi crediti</strong><small>{number(included)} inclusi · {number(extra)} extra</small><p><b>{number(credits)}</b> disponibili</p></Link>
      </div>
    </section>

    {active ? <div className="ws-split">
      <VideoIntro compact />
      <section className="ws-manager">
        <span className="ws-eyebrow">Il tuo account manager</span>
        <div className="ws-manager__person"><span>{initials(manager || 'WowStampa')}</span><div><strong>{manager || 'Il team WowStampa'}</strong><small>Ordini, preventivi, crediti e abbonamento</small></div></div>
        <OpenChatButton className="button button--ghost ws-manager__cta">Contatta</OpenChatButton>
      </section>
    </div> : <section className="ws-manager ws-manager--row">
      <div className="ws-manager__person"><span>{initials(manager || 'WowStampa')}</span><div><small>Il tuo account manager</small><strong>{manager || 'Il team WowStampa'}</strong></div></div>
      <OpenChatButton className="button button--ghost ws-manager__cta">Contatta</OpenChatButton>
    </section>}
  </main></>;
}

function initials(value: string) { return value.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
function number(value: number) { return new Intl.NumberFormat('it-IT').format(value); }
