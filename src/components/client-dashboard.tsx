import Link from 'next/link';
import Image from 'next/image';
import {ArrowRight, ArrowUpRight, Coins, Crown, MessageCircle, MessageSquareText, Package, Play, Sparkles} from 'lucide-react';

import {Avatar} from '@/components/avatar';
import {OpenChatButton} from '@/components/support-widget';
import {VideoIntro} from '@/components/video-intro';

export type DashboardTodo = {href: string; tag: string; title: string; label: string};
export type ClientDashboardProps = {
  name: string;
  active: boolean;
  todos: DashboardTodo[];
  requests: {open: number; toApprove: number};
  orders: {value: number; label: string; alert: boolean};
  credits: {included: number; extra: number};
  manager: {id: string | null; name: string};
};

const number = (value: number) => new Intl.NumberFormat('it-IT').format(value);

// Client workspace view: brand hero, what needs attention, requests/orders/credits and the account manager.
export function ClientDashboard({name, active, todos, requests, orders, credits, manager}: ClientDashboardProps) {
  const total = credits.included + credits.extra;
  const includedShare = total ? Math.max(4, Math.round((credits.included / total) * 100)) : 0;

  const hero = <section className="dash-hero">
    <div className="dash-hero__copy">
      <span className="dash-pill"><i /> {active ? 'WOWPRO attivo' : 'Benvenuto in WOWPRO'}</span>
      <h2>{active ? 'Bentornati,' : 'Benvenuti,'}<br /><span className="dash-hero__name">{name}</span></h2>
      <p>{active ? 'Grafica, stampa e supporto dedicato. Tutto in un solo posto.' : 'Attiva WOWPRO: grafica, stampa e supporto dedicato in un solo posto.'}</p>
      <div className="dash-hero__actions">
        {active ? <>
          <Link className="dash-btn dash-btn--primary" href="/dashboard/richieste?new=1">Nuova richiesta <ArrowRight size={17} /></Link>
          <Link className="dash-btn dash-btn--glass" href="/dashboard/richieste?tab=preventivi&new=quote">Chiedi un preventivo</Link>
        </> : <>
          <Link className="dash-btn dash-btn--primary" href="/dashboard/abbonamento">Attiva l’abbonamento <ArrowRight size={17} /></Link>
          <a className="dash-btn dash-btn--glass" href="#come-funziona"><Play size={15} fill="currentColor" /> Guarda come funziona</a>
        </>}
      </div>
    </div>
    <div aria-hidden="true" className="dash-hero__art"><Image alt="" fill priority sizes="(max-width: 760px) 0px, 460px" src="/images/wowpro-hero.png" /></div>
  </section>;

  const activate = <section className="dash-activate">
    <span className="dash-activate__icon"><Crown size={24} /></span>
    <div><small>Abbonamento non attivo</small><h3>Attiva WOWPRO e lavora con il tuo team dedicato</h3><p>12.000 crediti grafici ogni mese, listino riservato, ordini prioritari e un account manager tutto tuo.</p></div>
    <Link className="dash-btn dash-btn--light" href="/dashboard/abbonamento">Scopri l’abbonamento <ArrowRight size={17} /></Link>
  </section>;

  const todoList = todos.length ? <section className="dash-section">
    <header className="dash-section__head"><h3><Sparkles size={16} /> Da fare</h3><small>{todos.length === 1 ? '1 elemento' : `${todos.length} elementi`}</small></header>
    <ul className="dash-todo">{todos.map((todo) => <li key={todo.href}><Link href={todo.href}><b>{todo.tag}</b><span>{todo.title}</span><small>{todo.label}</small><ArrowRight size={16} /></Link></li>)}</ul>
  </section> : null;

  const cards = <section className="dash-section">
    <header className="dash-section__head"><h3>Il tuo workspace</h3></header>
    <div className="dash-cards">
      <Link className="dash-card dash-card--green" href="/dashboard/richieste">
        <header><span className="dash-card__icon"><MessageSquareText size={22} /></span><ArrowUpRight className="dash-card__arrow" size={20} /></header>
        <small>Le tue richieste</small>
        <b>{requests.open}</b>
        <span>Richieste in corso{requests.toApprove ? <em> · {requests.toApprove} da approvare</em> : null}</span>
        <i>Vedi richieste <ArrowRight size={15} /></i>
        <MessageSquareText aria-hidden="true" className="dash-card__ghost" size={132} strokeWidth={1.2} />
      </Link>
      <Link className="dash-card dash-card--blue" href="/dashboard/ordini">
        <header><span className="dash-card__icon"><Package size={22} /></span><ArrowUpRight className="dash-card__arrow" size={20} /></header>
        <small>I tuoi ordini</small>
        <b className={orders.alert ? 'is-alert' : ''}>{orders.value}</b>
        <span>{orders.label}</span>
        <i>Vedi ordini <ArrowRight size={15} /></i>
        <Package aria-hidden="true" className="dash-card__ghost" size={132} strokeWidth={1.2} />
      </Link>
      <Link className="dash-card dash-card--wallet" href="/dashboard/crediti">
        <header><span className="dash-card__icon"><Coins size={22} /></span><ArrowUpRight className="dash-card__arrow" size={20} /></header>
        <small>I tuoi crediti</small>
        <b>{number(total)}</b>
        <div aria-hidden="true" className="dash-meter"><span style={{width: `${includedShare}%`}} /></div>
        <span className="dash-legend"><em><i className="is-included" /> {number(credits.included)} inclusi</em><em><i /> {number(credits.extra)} extra</em></span>
        <i>Gestisci crediti <ArrowRight size={15} /></i>
      </Link>
    </div>
  </section>;

  const managerCard = <section className="dash-manager">
    <div className="dash-manager__photo"><Avatar name={manager.name || 'WowStampa'} profileId={manager.id} size={76} /><i aria-hidden="true" /></div>
    <div className="dash-manager__copy"><small>Il tuo account manager</small><strong>{manager.name || 'Il team WowStampa'}</strong><span>Ordini, preventivi, crediti e abbonamento: scrivimi quando vuoi.</span></div>
    <OpenChatButton className="dash-btn dash-btn--primary">
      <MessageCircle size={17} /> Contatta
    </OpenChatButton>
  </section>;

  return <main className="page-content dash">
    {hero}
    {active ? <>{todoList}{cards}{managerCard}<VideoIntro compact /></> : <><div className="dash-anchor" id="come-funziona"><VideoIntro /></div>{activate}</>}
  </main>;
}
