'use client';

/* eslint-disable @next/next/no-img-element -- promo pictures come from signed storage URLs */
import {useEffect, useState} from 'react';
import {useRouter} from 'next/navigation';
import {BellRing, CalendarClock, Check, ChevronDown, Clock3, Copy, ExternalLink, Gift, Lock, PiggyBank, Printer, ShoppingBag} from 'lucide-react';

import {PageIntro} from '@/components/page-intro';
import type {ClientPromo} from '@/lib/promo-view';
import {REORDER_URL, saveReorder} from '@/lib/reorder';

const money = (value: number) => new Intl.NumberFormat('it-IT', {style: 'currency', currency: 'EUR'}).format(value);
const day = (value: string) => new Intl.DateTimeFormat('it-IT', {day: 'numeric', month: 'long', timeZone: 'Europe/Rome'}).format(new Date(value));
const month = (value: string) => new Intl.DateTimeFormat('it-IT', {month: 'long', timeZone: 'Europe/Rome'}).format(new Date(value));
function inDays(value: string, now: number) {
  const days = Math.ceil((Date.parse(value) - now) / 86_400_000);
  return days <= 1 ? 'Domani' : `Tra ${days} giorni`;
}

// Client page "Promo in anteprima": the promo of the moment, the next ones, those still valid, the past ones.
export function ClientPromos({promos, now: initialNow}: {promos: ClientPromo[]; now: number}) {
  const [items, setItems] = useState(promos);
  const [now, setNow] = useState(initialNow);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  // Opening the page marks the early promos as seen (sidebar "NUOVA" badge).
  useEffect(() => {
    try {
      const seen = new Set(JSON.parse(window.localStorage.getItem('wowpro:promo-seen') || '[]') as string[]);
      for (const promo of promos) if (promo.stage === 'early') seen.add(promo.id);
      window.localStorage.setItem('wowpro:promo-seen', JSON.stringify([...seen].slice(-100)));
    } catch { /* Storage unavailable. */ }
  }, [promos]);

  async function toggleWatch(id: string) {
    setItems((current) => current.map((promo) => promo.id === id ? {...promo, watching: !promo.watching} : promo));
    const response = await fetch(`/api/client/promos/${id}/watch`, {method: 'POST'}).catch(() => null);
    const result = response?.ok ? await response.json() as {watching: boolean} : null;
    setItems((current) => current.map((promo) => promo.id === id ? {...promo, watching: result ? result.watching : !promo.watching} : promo));
  }

  const early = items.filter((promo) => promo.stage === 'early');
  const upcoming = items.filter((promo) => promo.stage === 'upcoming');
  const open = items.filter((promo) => promo.stage === 'public');
  const ended = items.filter((promo) => promo.stage === 'ended').reverse();
  const totalSaved = items.reduce((total, promo) => total + (promo.saved || 0), 0);
  const [hero, ...moreEarly] = early;

  return <section className="pm">
    <PageIntro text="Come cliente WOWPRO sblocchi le promozioni di WowStampa in anticipo: puoi usarle subito, prima che vengano aperte a tutti." title="Le offerte WowStampa, prima di tutti" />

    {hero ? <PromoHero now={now} promo={hero} /> : <section className="pm-empty"><span><Gift size={26} /></span><div><strong>Nessuna promo in anteprima in questo momento</strong><p>{upcoming.length ? `La prossima si sblocca ${inDays(upcoming[0].earlyStartsAt, now).toLowerCase()}: ti avvisiamo via email.` : 'Appena ne esce una ti avvisiamo via email, prima di tutti gli altri clienti.'}</p></div></section>}

    {moreEarly.length ? <section className="pm-section"><div className="pm-section__head"><h4>Anche in anteprima</h4><small>Riservate ai clienti WOWPRO, ancora per poco</small></div>
      <div className="pm-grid">{moreEarly.map((promo) => <PromoCard key={promo.id} now={now} promo={promo} />)}</div></section> : null}

    {upcoming.length ? <section className="pm-section"><div className="pm-section__head"><h4>In arrivo</h4><small>Ti avvisiamo via email appena si sbloccano per te</small></div>
      <div className="pm-grid">{upcoming.map((promo) => <PromoCard key={promo.id} now={now} onWatch={() => toggleWatch(promo.id)} promo={promo} />)}</div></section> : null}

    {open.length ? <section className="pm-section"><div className="pm-section__head"><h4>Ancora valide</h4><small>Già aperte a tutti, ma puoi ancora usarle</small></div>
      <div className="pm-grid">{open.map((promo) => <PromoCard key={promo.id} now={now} promo={promo} />)}</div></section> : null}

    {ended.length ? <details className="pm-ended"><summary><PiggyBank size={18} /> Promo concluse {totalSaved ? <em>Hai risparmiato {money(totalSaved)} con WOWPRO</em> : <span className="pm-ended__spacer" />}<ChevronDown size={16} /></summary>
      <ul>{ended.map((promo) => <li key={promo.id}><span>{promo.title} {promo.discount}</span><small>{month(promo.endsAt || promo.earlyStartsAt)}</small>{promo.saved ? <b>Usata · -{money(promo.saved)}</b> : <i>Non usata</i>}</li>)}</ul>
    </details> : null}
  </section>;
}

function Countdown({target, now}: {target: string; now: number}) {
  const left = Math.max(0, Date.parse(target) - now);
  const days = Math.floor(left / 86_400_000);
  const hours = Math.floor((left % 86_400_000) / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);
  return <div className="pm-count__row">
    <div className="pm-count__unit"><b>{days}</b><i>{days === 1 ? 'giorno' : 'giorni'}</i></div>
    <div className="pm-count__unit"><b>{String(hours).padStart(2, '0')}</b><i>ore</i></div>
    <div className="pm-count__unit"><b>{String(minutes).padStart(2, '0')}</b><i>min</i></div>
  </div>;
}

function CopyCode({code, compact = false}: {code: string; compact?: boolean}) {
  const [copied, setCopied] = useState(false);
  async function copy() { try { await navigator.clipboard.writeText(code); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* Clipboard blocked: the code stays visible. */ } }
  if (compact) return <button className="pm-chip-btn" onClick={copy} type="button">{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copiato' : code}</button>;
  return <button className="pm-code__box" onClick={copy} type="button">{code}<span>{copied ? <Check size={12} /> : <Copy size={12} />}{copied ? 'Copiato' : 'Copia'}</span></button>;
}

function useQuoteWithPromo(promo: ClientPromo) {
  const router = useRouter();
  return () => {
    if (!promo.code) return;
    saveReorder({items: [], source: promo.title, notes: `Promo ${promo.title} (${promo.discount}) · codice ${promo.code}: applicate lo sconto al preventivo.`, promo: {code: promo.code, title: promo.title, discount: promo.discount}});
    router.push(REORDER_URL);
  };
}

function PromoHero({promo, now}: {promo: ClientPromo; now: number}) {
  const quote = useQuoteWithPromo(promo);
  const target = promo.publicStartsAt || promo.endsAt;
  return <article className="pm-hero">
    <div className="pm-hero__copy">
      <div className="pm-badges"><span className="pm-badge pm-badge--excl"><Lock size={11} /> Esclusiva WOWPRO</span>{now - Date.parse(promo.earlyStartsAt) < 3 * 86_400_000 ? <span className="pm-badge pm-badge--new">Nuova</span> : null}</div>
      <h3>{promo.title}</h3>
      {promo.description ? <p>{promo.description}</p> : null}
      {target ? <div className="pm-count"><small>{promo.publicStartsAt ? 'Solo per i clienti WOWPRO ancora per' : 'Riservata ai clienti WOWPRO, scade tra'}</small><div className="pm-count__wrap"><Countdown now={now} target={target} />
        <span className="pm-count__then">{promo.publicStartsAt ? <>poi aperta a tutti{promo.endsAt ? <><br />fino al <b>{day(promo.endsAt)}</b></> : null}</> : <>valida fino al<br /><b>{day(target)}</b></>}</span></div></div> : null}
      {promo.code ? <div className="pm-code"><CopyCode code={promo.code} />{promo.scopeLabel ? <small className="pm-scope">Su: {promo.scopeLabel}</small> : null}</div> : null}
      <div className="pm-actions"><a className="pm-btn pm-btn--primary" href={promo.link} rel="noreferrer" target="_blank"><ShoppingBag size={17} /> Usa su wowstampa.com <ExternalLink size={14} /></a><button className="pm-btn pm-btn--glass" onClick={quote} type="button"><Printer size={16} /> Preventivo con lo sconto</button></div>
    </div>
    <div className="pm-hero__art">{promo.imageUrl ? <img alt="" src={promo.imageUrl} /> : <div className="pm-product"><Gift size={110} strokeWidth={1.2} /></div>}<div className="pm-off"><b>{promo.discount}</b><small>sconto</small></div></div>
  </article>;
}

function PromoCard({promo, now, onWatch}: {promo: ClientPromo; now: number; onWatch?: () => void}) {
  const quote = useQuoteWithPromo(promo);
  const locked = promo.stage === 'upcoming';
  return <article className="pm-card">
    <div className={`pm-card__art${locked ? ' pm-card__art--lock' : ''}`}>
      {promo.imageUrl ? <img alt="" src={promo.imageUrl} /> : <Gift size={50} strokeWidth={1.3} />}
      <span className="pm-card__off">{promo.discount}</span>
      {locked ? <div className="pm-teaser"><span><Lock size={17} /></span>Si sblocca il {day(promo.earlyStartsAt)}</div> : null}
    </div>
    <div className="pm-card__body">
      <strong>{promo.title}</strong>
      {promo.description ? <p>{promo.description}</p> : null}
      <div className="pm-card__meta">
        {locked ? <span className={`pm-when${Date.parse(promo.earlyStartsAt) - now < 7 * 86_400_000 ? ' pm-when--soon' : ''}`}><CalendarClock size={14} /> {inDays(promo.earlyStartsAt, now)}</span>
          : promo.stage === 'early' && promo.publicStartsAt ? <span className="pm-when pm-when--soon"><Lock size={13} /> Per tutti dal {day(promo.publicStartsAt)}</span>
          : promo.endsAt ? <span className="pm-when"><Clock3 size={14} /> Fino al {day(promo.endsAt)}</span> : <span className="pm-when"><Clock3 size={14} /> Senza scadenza</span>}
        {locked ? <button className={`pm-chip-btn${promo.watching ? ' pm-chip-btn--on' : ''}`} onClick={onWatch} type="button">{promo.watching ? <><Check size={13} /> Ti avviseremo</> : <><BellRing size={13} /> Avvisami</>}</button>
          : promo.code ? <CopyCode code={promo.code} compact /> : null}
      </div>
      {!locked && promo.code ? <div className="pm-card__actions"><a className="pm-link" href={promo.link} rel="noreferrer" target="_blank">Usa sul sito <ExternalLink size={12} /></a><button className="pm-link" onClick={quote} type="button">Preventivo con lo sconto</button></div> : null}
    </div>
  </article>;
}
