'use client';

import {ArrowRight, BadgeCheck, BadgePercent, Box, CalendarCheck, Check, Gift, Headphones, Lock, MessageSquareText, Palette, Receipt, ScanSearch, Send, Sparkles} from 'lucide-react';
import {useState} from 'react';

import {PurchaseModal, type BillingDraft, type SubscriptionPlanOption} from '@/components/subscription-actions';
import {OpenChatButton} from '@/components/support-widget';

const MONTHLY = 129;
const ANNUAL = 1290;
const CREDITS = 12_000;

const BENEFITS = [
  {icon: Palette, title: 'Reparto grafico dedicato', text: 'Revisioni, modifiche e creazioni grafiche con i tuoi crediti inclusi.'},
  {icon: Headphones, title: 'Account manager dedicato', text: 'Una persona di riferimento in chat, email e telefono.'},
  {icon: BadgePercent, title: 'Listino riservato', text: 'Prezzi WOWPRO su tutto il catalogo, applicati in automatico.'},
  {icon: Sparkles, title: 'Produzione prioritaria', text: 'I tuoi ordini passano in testa alla coda di stampa.'},
  {icon: Box, title: 'Spedizione white label', text: 'Pacco anonimo con il tuo nome come mittente.'},
  {icon: ScanSearch, title: 'Preventivi rapidi', text: 'Quotazioni su misura in tempi brevi.'},
  {icon: Gift, title: 'Promo in anteprima', text: 'Accesso per primo alle offerte riservate.'},
  {icon: MessageSquareText, title: 'Tutto in un portale', text: 'Richieste, file, crediti e ordini in un unico posto.'},
];

const USES = [
  {count: 12, label: 'revisioni', cost: '1.000 crediti l’una'},
  {count: 6, label: 'modifiche', cost: '2.000 crediti l’una'},
  {count: 4, label: 'creazioni', cost: '3.000 crediti l’una'},
];

const STEPS = [
  {icon: CalendarCheck, title: 'Attivi in 2 minuti', text: 'Scegli mensile o annuale, inserisci i dati di fatturazione e paghi con carta.'},
  {icon: Send, title: 'Invii le richieste', text: 'Dal portale descrivi cosa ti serve e alleghi i file: i crediti si scalano da soli.'},
  {icon: BadgeCheck, title: 'Approvi la grafica', text: 'Il tuo grafico ti manda la bozza, tu approvi o chiedi modifiche nella stessa pagina.'},
];

const FAQ = [
  {q: 'Posso disdire quando voglio?', a: 'Sì. Non ci sono vincoli: richiedi la disdetta dal portale e l’abbonamento non si rinnova più.'},
  {q: 'Come ricevo la fattura?', a: 'Ricevi fattura elettronica via SDI, emessa da Strategia Associati in Comunicazione S.r.l. con i dati che inserisci al momento dell’attivazione.'},
  {q: 'I crediti non usati si accumulano?', a: 'I crediti inclusi si rinnovano ogni mese e non sono cumulabili. Se ti servono più crediti puoi acquistare crediti extra, che non scadono mai.'},
  {q: 'Come avviene il pagamento?', a: 'Con carta sul checkout sicuro di WowStampa. Il rinnovo è automatico sulla stessa carta, che puoi aggiornare quando vuoi.'},
];

const euro = (value: number, digits = 0) => new Intl.NumberFormat('it-IT', {style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits}).format(value);

// Sales page shown to invited clients who have never subscribed.
export function SubscriptionLanding({options, billing, payments, managerName}: {options: SubscriptionPlanOption[]; billing: BillingDraft; payments: number; managerName: string | null}) {
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('annual');
  const [buyPlan, setBuyPlan] = useState<SubscriptionPlanOption['id'] | null>(null);
  const annual = cycle === 'annual';
  const perMonth = annual ? ANNUAL / 12 : MONTHLY;
  const saving = MONTHLY * 12 - ANNUAL;

  const toggle = <div aria-label="Fatturazione" className="sub-landing__toggle" role="radiogroup">
    <button aria-checked={!annual} className={!annual ? 'is-active' : ''} onClick={() => setCycle('monthly')} role="radio" type="button">Mensile</button>
    <button aria-checked={annual} className={annual ? 'is-active' : ''} onClick={() => setCycle('annual')} role="radio" type="button">Annuale <b>2 mesi gratis</b></button>
  </div>;

  return <div className="sub-landing">
    <section className="sub-landing__hero">
      <div className="sub-landing__intro">
        <span className="sub-landing__eyebrow"><i /> PROGRAMMA WOWPRO · SU INVITO</span>
        <h2>Il tuo reparto grafico,<br /><em>a canone fisso.</em></h2>
        <p>Grafiche pronte per la stampa senza assumere nessuno: ogni mese hai {CREDITS.toLocaleString('it-IT')} crediti da usare con il tuo grafico dedicato, più tutti i vantaggi riservati ai clienti WOWPRO.</p>
        {toggle}
        <div className="sub-landing__price">
          <strong>{euro(perMonth, annual ? 2 : 0)}</strong><span>/ mese<br />+ IVA</span>
        </div>
        <p className="sub-landing__billing">{annual ? <>Fatturati {euro(ANNUAL)} + IVA all’anno · <b>risparmi {euro(saving)}</b></> : <>Fatturati ogni mese · disdici quando vuoi</>}</p>
        <div className="sub-landing__actions">
          <button className="button button--primary" onClick={() => setBuyPlan(cycle)} type="button">Attiva WOWPRO <ArrowRight size={17} /></button>
          <OpenChatButton className="button sub-landing__ghost">Ho una domanda</OpenChatButton>
        </div>
        <ul className="sub-landing__trust"><li><Lock size={14} /> Pagamento sicuro con carta</li><li><Receipt size={14} /> Fattura elettronica</li><li><Check size={14} /> Nessun vincolo</li></ul>
      </div>
      <aside className="sub-landing__credits">
        <span className="sub-landing__credits-label">OGNI MESE HAI</span>
        <strong>{CREDITS.toLocaleString('it-IT')}</strong>
        <small>crediti grafici inclusi</small>
        <p>che equivalgono, per esempio, a</p>
        <ul>{USES.map((use) => <li key={use.label}><b>{use.count}</b><span>{use.label}<small>{use.cost}</small></span></li>)}</ul>
        <p className="sub-landing__credits-foot">oppure combinali come preferisci.</p>
      </aside>
    </section>

    <section className="sub-landing__block">
      <div className="sub-landing__heading"><h3>Cosa include WOWPRO</h3><p>Un unico abbonamento, tutto quello che serve per comunicare e stampare meglio.</p></div>
      <div className="sub-landing__benefits">{BENEFITS.map(({icon: Icon, title, text}) => <article key={title}><span><Icon size={20} /></span><h4>{title}</h4><p>{text}</p></article>)}</div>
    </section>

    <section className="sub-landing__block">
      <div className="sub-landing__heading"><h3>Come funziona</h3></div>
      <ol className="sub-landing__steps">{STEPS.map(({icon: Icon, title, text}, index) => <li key={title}><span><Icon size={20} /><i>{index + 1}</i></span><h4>{title}</h4><p>{text}</p></li>)}</ol>
    </section>

    <section className="sub-landing__block">
      <div className="sub-landing__heading"><h3>Scegli come pagare</h3><p>Stessi vantaggi e stessi crediti, cambia solo la frequenza di pagamento.</p></div>
      <div className="sub-landing__plans">
        {options.map((option) => {
          const isAnnual = option.id === 'annual';
          return <article className={isAnnual ? 'is-featured' : ''} key={option.id}>
            {isAnnual ? <span className="sub-landing__badge">PIÙ CONVENIENTE</span> : null}
            <h4>{option.label}</h4>
            <div className="sub-landing__plan-price"><strong>{euro(isAnnual ? ANNUAL : MONTHLY)}</strong><span>+ IVA / {isAnnual ? 'anno' : 'mese'}</span></div>
            <p>{isAnnual ? <>Pari a {euro(ANNUAL / 12, 2)} al mese · <b>risparmi {euro(saving)}</b></> : 'Massima flessibilità, rinnovo ogni mese'}</p>
            <ul><li><Check size={15} /> {CREDITS.toLocaleString('it-IT')} crediti ogni mese</li><li><Check size={15} /> Tutti i vantaggi WOWPRO</li><li><Check size={15} /> Disdetta in qualsiasi momento</li></ul>
            <button className={isAnnual ? 'button button--primary' : 'button sub-landing__outline'} onClick={() => setBuyPlan(option.id)} type="button">Scegli {option.label.toLowerCase()}</button>
          </article>;
        })}
      </div>
    </section>

    <section className="sub-landing__block">
      <div className="sub-landing__heading"><h3>Domande frequenti</h3></div>
      <div className="sub-landing__faq">{FAQ.map((item) => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
      <p className="sub-landing__help">Hai altri dubbi? {managerName ? `${managerName} ti risponde` : 'Il tuo account manager ti risponde'} in chat. <OpenChatButton className="sub-landing__link">Scrivici</OpenChatButton></p>
    </section>

    <button className="fab sub-landing__fab" onClick={() => setBuyPlan(cycle)} type="button">Attiva WOWPRO · {euro(perMonth, annual ? 2 : 0)}/mese</button>
    {buyPlan ? <PurchaseModal billing={billing} initialPlan={buyPlan} onClose={() => setBuyPlan(null)} options={options} payments={payments} /> : null}
  </div>;
}
