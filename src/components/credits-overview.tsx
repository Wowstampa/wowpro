'use client';

import {ArrowRight, BadgeCheck, CalendarClock, Hourglass, Infinity as Forever, Minus, Pencil, PiggyBank, Plus, RefreshCw, Sparkles, Wallet} from 'lucide-react';
import Link from 'next/link';
import {useMemo, useState} from 'react';

import {CreditPurchase} from '@/components/credit-purchase';

export type CreditMove = {id: string; bucket: string; amount: number; description: string; createdAt: string};

const n = (value: number) => new Intl.NumberFormat('it-IT', {useGrouping: 'always'} as Intl.NumberFormatOptions).format(value);
const longDay = (value: Date) => new Intl.DateTimeFormat('it-IT', {day: 'numeric', month: 'long'}).format(value);
const shortDay = (value: string) => new Intl.DateTimeFormat('it-IT', {day: 'numeric', month: 'short'}).format(new Date(value));
const monthLabel = (value: string) => new Intl.DateTimeFormat('it-IT', {month: 'long', year: 'numeric'}).format(new Date(value));
const SERVICES = [
  {key: 'revision', title: 'Revisione', cost: 1000, text: 'Controllo file e piccole correzioni su un progetto esistente.', icon: BadgeCheck},
  {key: 'modification', title: 'Modifica', cost: 2000, text: 'Interventi sostanziali su grafica, testi o impaginazione.', icon: Pencil},
  {key: 'creation', title: 'Creazione', cost: 3000, text: 'Una grafica nuova progettata da zero sulle tue indicazioni.', icon: Sparkles},
];

// Next monthly reset: the day of the month of the renewal date (annual plans reset every month on the same day).
function nextReset(renewal: string) {
  if (!renewal) return null;
  const anchor = new Date(`${renewal}T12:00:00`).getDate();
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const candidate = (offset: number) => { const base = new Date(today.getFullYear(), today.getMonth() + offset, 1, 12); const last = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate(); base.setDate(Math.min(anchor, last)); return base; };
  const date = candidate(0) > today ? candidate(0) : candidate(1);
  return {date, days: Math.round((date.getTime() - today.getTime()) / 86_400_000)};
}

// Credits page: balance at a glance, included vs extra, what the balance buys, and where the credits went.
export function CreditsOverview({included, extra, monthly, renewal, moves}: {included: number; extra: number; monthly: number; renewal: string; moves: CreditMove[]}) {
  const total = included + extra;
  const [filter, setFilter] = useState<'all' | 'out' | 'in'>('all');
  const reset = nextReset(renewal);
  const share = monthly ? Math.min(100, Math.round((included / monthly) * 100)) : 0;

  // Consumption of the last six months (credits spent, both buckets).
  const chart = useMemo(() => {
    const now = new Date();
    return Array.from({length: 6}, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const used = moves.filter((move) => move.amount < 0 && `${new Date(move.createdAt).getFullYear()}-${new Date(move.createdAt).getMonth()}` === key).reduce((sum, move) => sum - move.amount, 0);
      return {label: new Intl.DateTimeFormat('it-IT', {month: 'short'}).format(date), used, current: index === 5};
    });
  }, [moves]);
  const peak = Math.max(1, ...chart.map((bar) => bar.used));

  const visible = moves.filter((move) => filter === 'all' || (filter === 'in' ? move.amount > 0 : move.amount < 0));
  const months = visible.reduce<Array<{label: string; items: CreditMove[]}>>((groups, move) => {
    const label = monthLabel(move.createdAt);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(move); else groups.push({label, items: [move]});
    return groups;
  }, []);

  return <div className="cr">
    <section className="cr-summary">
      <div>
        <small>Il tuo saldo</small>
        <h2>Hai <b>{n(total)}</b> crediti</h2>
        <div aria-hidden="true" className="cr-stack">{total ? <><i className="is-inc" style={{width: `${(included / total) * 100}%`}} /><i className="is-ext" style={{width: `${(extra / total) * 100}%`}} /></> : null}</div>
        <div className="cr-legend"><span><i className="is-inc" /> {n(included)} inclusi nel piano</span><span><i className="is-ext" /> {n(extra)} extra</span></div>
      </div>
      <div className="cr-equals"><p>Con questi crediti puoi chiedere, ad esempio:</p><ul>{SERVICES.map((service) => <li key={service.key}><b>{Math.floor(total / service.cost)}</b><span>{service.title === 'Revisione' ? 'revisioni' : service.title === 'Modifica' ? 'modifiche' : 'creazioni'}</span></li>)}</ul></div>
    </section>

    <div className="cr-pair">
      <article className="cr-card cr-card--inc">
        <div className="cr-card__top"><div className="cr-card__title"><span><RefreshCw size={19} /></span><div><strong>Crediti inclusi</strong><small>Ogni mese con il piano</small></div></div><b className="cr-tag"><Hourglass size={11} /> Si azzerano a fine mese</b></div>
        <div className="cr-gauge">
          <div aria-label={`${n(included)} crediti inclusi su ${n(monthly)}`} className="cr-ring" role="img" style={{['--p' as string]: `${share}%`}}><div><b>{n(included)}</b><small>{monthly ? `di ${n(monthly)}` : 'disponibili'}</small></div></div>
          <div className="cr-facts">
            <div><span>Usati questo mese</span><b>{n(Math.max(monthly - included, 0))}</b></div>
            <div><span>Ancora disponibili</span><b>{monthly ? `${share}%` : '—'}</b></div>
            <div><span>Si usano</span><b>per primi</b></div>
          </div>
        </div>
        {reset ? <div className="cr-renew"><CalendarClock size={17} /><span>Tornano a {n(monthly)} {reset.days === 0 ? <b>oggi</b> : reset.days === 1 ? <b>domani</b> : <>tra <b>{reset.days} giorni</b></>} · {longDay(reset.date)}</span></div> : <div className="cr-renew"><CalendarClock size={17} /><span>Si ricaricano ogni mese alla data di attivazione del piano</span></div>}
      </article>
      <div aria-hidden="true" className="cr-flow"><span><ArrowRight size={16} /></span><small>prima gli inclusi,<br />poi gli extra</small></div>
      <article className="cr-card cr-card--ext">
        <div className="cr-card__top"><div className="cr-card__title"><span><PiggyBank size={19} /></span><div><strong>Crediti extra</strong><small>La tua riserva</small></div></div><b className="cr-tag"><Forever size={11} /> Non scadono</b></div>
        <div className="cr-big">{n(extra)}</div>
        <p>Restano tuoi anche dopo il rinnovo mensile e si usano solo quando hai finito gli inclusi. Comodi per i mesi più intensi.</p>
        <div className="cr-buy"><CreditPurchase /></div>
        <Wallet aria-hidden="true" className="cr-ghost" size={150} strokeWidth={1.2} />
      </article>
    </div>

    <section className="cr-section">
      <h3>Cosa puoi chiedere</h3>
      <p>Il costo in crediti di ogni servizio grafico e quante volte puoi farlo con il saldo attuale.</p>
      <div className="cr-services">{SERVICES.map((service) => { const Icon = service.icon; return <article className="cr-service" key={service.key}>
        <header><span><Icon size={19} /></span><b>{n(service.cost)} crediti</b></header>
        <strong>{service.title}</strong><p>{service.text}</p>
        <footer><span>Ne puoi fare <b>{Math.floor(total / service.cost)}</b></span><Link href="/dashboard/richieste?new=grafica">Richiedi <ArrowRight size={14} /></Link></footer>
      </article>; })}</div>
    </section>

    <section className="cr-moves">
      <div className="cr-moves__head">
        <div><h3>Movimenti</h3><p>Crediti usati negli ultimi 6 mesi</p>
          <div className="cr-chart">{chart.map((bar) => <div className={bar.current ? 'is-current' : ''} key={bar.label} title={`${n(bar.used)} crediti`}><i style={{height: `${Math.max(4, Math.round((bar.used / peak) * 56))}px`}} /><small>{bar.label}</small></div>)}</div>
        </div>
        <div className="cr-filter" role="tablist">{([['all', 'Tutti'], ['out', 'Consumi'], ['in', 'Ricariche']] as const).map(([key, label]) => <button aria-selected={filter === key} className={filter === key ? 'is-on' : ''} key={key} onClick={() => setFilter(key)} role="tab" type="button">{label}</button>)}</div>
      </div>
      {months.length ? months.map((group) => <div key={group.label}>
        <div className="cr-month">{group.label}</div>
        {group.items.map((move) => <div className={`cr-move ${move.amount > 0 ? 'is-in' : 'is-out'}`} key={move.id}>
          <span>{move.amount > 0 ? <Plus size={16} /> : <Minus size={16} />}</span>
          <div><strong>{move.description}</strong><small>{shortDay(move.createdAt)}</small></div>
          <em>{move.bucket === 'extra' ? 'Extra' : 'Inclusi'}</em>
          <b>{move.amount > 0 ? '+' : ''}{n(move.amount)}</b>
        </div>)}
      </div>) : <p className="cr-empty">{moves.length ? 'Nessun movimento di questo tipo.' : 'Gli accrediti e i consumi compariranno qui.'}</p>}
    </section>
  </div>;
}
