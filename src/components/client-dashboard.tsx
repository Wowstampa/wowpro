/* eslint-disable @next/next/no-img-element -- Shopify CDN thumbnails are already resized */
import Link from 'next/link';
import Image from 'next/image';
import {ArrowRight, ArrowUpRight, Bell, Coins, Crown, ExternalLink, FileText, MessageCircle, MessageSquareText, Package, Palette, Play, Plus, Printer, Truck} from 'lucide-react';

import {Avatar} from '@/components/avatar';
import {DashboardOnboarding} from '@/components/dashboard-onboarding';
import {ReorderButton} from '@/components/reorder-button';
import {OpenChatButton} from '@/components/support-widget';
import {VideoIntro} from '@/components/video-intro';
import type {DashboardActivity, WorkspaceData} from '@/lib/dashboard-data';

export type ClientDashboardProps = {name: string; active: boolean; manager: {id: string | null; name: string}; workspace: WorkspaceData | null};

const number = (value: number) => new Intl.NumberFormat('it-IT', {useGrouping: 'always'} as Intl.NumberFormatOptions).format(value);
const money = (value: number, currency: string) => new Intl.NumberFormat('it-IT', {style: 'currency', currency: currency || 'EUR'}).format(value);
const day = (value: string) => new Intl.DateTimeFormat('it-IT', {day: 'numeric', month: 'long'}).format(new Date(value));
function ago(value: string) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min fa`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 ora fa' : `${hours} ore fa`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'ieri' : days < 7 ? `${days} giorni fa` : day(value);
}
const ACTIVITY_ICONS: Record<DashboardActivity['kind'], typeof Bell> = {grafica: Palette, stampa: Printer, messaggio: MessageCircle, file: FileText};

// Client home: welcome page (no subscription) or the subscriber workspace.
export function ClientDashboard({name, active, manager, workspace}: ClientDashboardProps) {
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

  if (!active || !workspace) {
    return <main className="page-content dash">
      {hero}
      <div className="dash-anchor" id="come-funziona"><VideoIntro /></div>
      <section className="dash-activate">
        <span className="dash-activate__icon"><Crown size={24} /></span>
        <div><small>Abbonamento non attivo</small><h3>Attiva WOWPRO e lavora con il tuo team dedicato</h3><p>12.000 crediti grafici ogni mese, listino riservato, ordini prioritari e un account manager tutto tuo.</p></div>
        <Link className="dash-btn dash-btn--light" href="/dashboard/abbonamento">Scopri l’abbonamento <ArrowRight size={17} /></Link>
      </section>
    </main>;
  }

  const {counts, jobs, jobsTotal, orders, ordersAvailable, activity, credits, onboarding} = workspace;
  const total = credits.included + credits.extra;
  const usedShare = credits.monthly ? Math.min(100, Math.round((credits.used / credits.monthly) * 100)) : 0;

  const cards = <div className="dash-cards">
    <Link className="dash-card dash-card--green" href="/dashboard/richieste">
      <header><span className="dash-card__icon"><MessageSquareText size={22} /></span><ArrowUpRight className="dash-card__arrow" size={20} /></header>
      <small>Richieste in corso</small>
      <b>{counts.open}</b>
      <span>{counts.action ? <em>{counts.action} {counts.action === 1 ? 'aspetta' : 'aspettano'} una tua risposta</em> : 'Il team ci sta lavorando'}</span>
      <i>Vedi richieste <ArrowRight size={15} /></i>
      <MessageSquareText aria-hidden="true" className="dash-card__ghost" size={132} strokeWidth={1.2} />
    </Link>
    <Link className="dash-card dash-card--blue" href="/dashboard/ordini">
      <header><span className="dash-card__icon"><Truck size={22} /></span><ArrowUpRight className="dash-card__arrow" size={20} /></header>
      <small>Ordini in arrivo</small>
      <b>{counts.moving}</b>
      <span>{counts.moving ? 'In produzione o in viaggio' : 'Nessun ordine in viaggio'}</span>
      <i>Vedi ordini <ArrowRight size={15} /></i>
      <Truck aria-hidden="true" className="dash-card__ghost" size={132} strokeWidth={1.2} />
    </Link>
    <Link className="dash-card dash-card--wallet" href="/dashboard/crediti">
      <header><span className="dash-card__icon"><Coins size={22} /></span><ArrowUpRight className="dash-card__arrow" size={20} /></header>
      <small>Crediti disponibili</small>
      <b>{number(total)}</b>
      {credits.monthly ? <>
        <div aria-hidden="true" className="dash-meter"><span style={{width: `${Math.max(usedShare, 2)}%`}} /></div>
        <span className="dash-legend"><em>Usati {number(credits.used)} di {number(credits.monthly)} questo mese</em>{credits.renewal ? <em>Si rinnovano il {day(credits.renewal)}</em> : null}{credits.extra ? <em>+ {number(credits.extra)} extra</em> : null}</span>
      </> : <span className="dash-legend"><em>{number(credits.included)} inclusi · {number(credits.extra)} extra</em></span>}
      <i>Gestisci crediti <ArrowRight size={15} /></i>
    </Link>
  </div>;

  const jobsPanel = <section className="dash-panel dash-panel--jobs">
    <header className="dash-panel__head"><h3>Lavori in corso</h3>{jobsTotal > jobs.length ? <Link href="/dashboard/richieste">Vedi tutti ({jobsTotal}) <ArrowRight size={14} /></Link> : null}</header>
    {jobs.length ? <ul className="dash-jobs">{jobs.map((job) => <li key={job.id}><Link className={`dash-job dash-job--${job.tone}`} href={job.href}>
      <span className={`dash-job__icon dash-job__icon--${job.kind}`}>{job.kind === 'grafica' ? <Palette size={18} /> : <Printer size={18} />}</span>
      <div className="dash-job__main">
        <div className="dash-job__top"><small>{job.publicId} · {job.kind === 'grafica' ? 'Grafica' : 'Stampa'}</small><b>{job.label}</b></div>
        <strong>{job.title}</strong>
        <ol aria-label={`Fase ${job.current + 1} di ${job.steps.length}: ${job.steps[job.current]}`} className="dash-steps">{job.steps.map((step, index) => <li className={index < job.current ? 'is-done' : index === job.current ? 'is-current' : ''} key={step}><i /><span>{step}</span></li>)}</ol>
      </div>
      <ArrowRight className="dash-job__go" size={16} />
    </Link></li>)}</ul>
      : <div className="dash-empty"><span><Palette size={22} /></span><strong>Nessun lavoro in corso</strong><p>Quando invii una richiesta grafica o un preventivo, qui vedi a che punto è.</p><Link className="dash-btn dash-btn--primary dash-btn--sm" href="/dashboard/richieste?new=1"><Plus size={15} /> Nuova richiesta</Link></div>}
  </section>;

  const activityPanel = <section className="dash-panel dash-panel--activity">
    <header className="dash-panel__head"><h3>Attività recente</h3></header>
    {activity.length ? <ol className="dash-activity">{activity.map((item) => {
      const Icon = ACTIVITY_ICONS[item.kind];
      return <li key={item.id}><span className={`dash-activity__icon dash-activity__icon--${item.kind}`}><Icon size={14} /></span><Link href={item.href}><span>{item.text}</span><time dateTime={item.at}>{ago(item.at)}</time></Link></li>;
    })}</ol> : <div className="dash-empty dash-empty--small"><span><Bell size={20} /></span><strong>Ancora nessuna novità</strong><p>Bozze, messaggi e aggiornamenti del team compariranno qui.</p></div>}
  </section>;

  const ordersPanel = <section className="dash-panel dash-panel--orders">
    <header className="dash-panel__head"><h3>I tuoi ordini</h3><Link href="/dashboard/ordini">Tutti gli ordini <ArrowRight size={14} /></Link></header>
    {orders.length ? <ul className="dash-orders">{orders.map((order) => <li key={order.id}>
      <span className="dash-orders__thumb">{order.imageUrl ? <img alt="" height={48} src={order.imageUrl} width={48} /> : <Package size={20} />}</span>
      <div className="dash-orders__main"><strong>Ordine {order.name}</strong><small>{order.summary} · {money(order.total, order.currency)}</small></div>
      <div className="dash-orders__status"><b className={`dash-stage dash-stage--${order.stage}`}>{order.stageLabel}</b>{order.tracking && order.stage !== 'production' ? <small>{[order.tracking.company, order.tracking.label].filter(Boolean).join(' · ')}</small> : null}</div>
      <div className="dash-orders__actions">
        {order.tracking?.url && order.stage === 'shipped' ? <a className="client-action" href={order.tracking.url} rel="noreferrer" target="_blank"><Truck size={14} /> Traccia <ExternalLink size={12} /></a> : null}
        <ReorderButton className="client-action client-action--ghost" draft={order.reorder} />
      </div>
    </li>)}</ul>
      : <div className="dash-empty dash-empty--small"><span><Package size={20} /></span><strong>{ordersAvailable ? 'Nessun ordine di stampa recente' : 'Ordini non disponibili al momento'}</strong><p>{ordersAvailable ? 'Gli ordini pagati compaiono qui con stato e tracking della spedizione.' : 'Riprova tra qualche istante.'}</p></div>}
  </section>;

  const managerCard = <section className="dash-manager dash-manager--stack">
    <div className="dash-manager__photo"><Avatar name={manager.name || 'WowStampa'} profileId={manager.id} size={76} /><i aria-hidden="true" /></div>
    <div className="dash-manager__copy"><small>Il tuo account manager</small><strong>{manager.name || 'Il team WowStampa'}</strong><span>Ordini, preventivi, crediti e abbonamento: scrivimi quando vuoi.</span></div>
    <OpenChatButton className="dash-btn dash-btn--primary"><MessageCircle size={17} /> Contatta</OpenChatButton>
  </section>;

  return <main className="page-content dash">
    {hero}
    <DashboardOnboarding steps={onboarding} />
    {cards}
    <div className="dash-split">{jobsPanel}{activityPanel}</div>
    <div className="dash-split">{ordersPanel}{managerCard}</div>
    <VideoIntro compact />
  </main>;
}
