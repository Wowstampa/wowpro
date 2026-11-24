'use client';

import Link from 'next/link';
import {ArrowRight, BadgeCheck, BadgePercent, Box, Coins, CreditCard, Gift, Headphones, History, Lightbulb, MessageSquareText, PackageCheck, Palette, Pencil, Printer, ScanSearch, Sparkles, UserRound, UsersRound, Zap} from 'lucide-react';
import {useState} from 'react';

type Feature = {icon: typeof Palette; title: string; text: string; tag?: string};
type Area = {id: string; icon: typeof Palette; label: string; hint: string; title: string; intro: string; features: Feature[]; cta: {href: string; label: string}; secondary?: {href: string; label: string; external?: boolean}};

const AREAS: Area[] = [
  {
    id: 'grafica', icon: Palette, label: 'Grafica', hint: 'Revisioni, modifiche, creazioni',
    title: 'Il tuo reparto grafico, sempre a disposizione',
    intro: 'Mandi una richiesta dal portale, il tuo grafico dedicato ci lavora e ti invia la bozza. Paghi in crediti, senza preventivi né attese.',
    features: [
      {icon: BadgeCheck, title: 'Revisione', tag: '1.000 crediti', text: 'Controllo del file e piccole correzioni prima della stampa.'},
      {icon: Pencil, title: 'Modifica', tag: '2.000 crediti', text: 'Interventi su grafica, testi o impaginazione di un progetto esistente.'},
      {icon: Sparkles, title: 'Creazione', tag: '3.000 crediti', text: 'Una grafica nuova progettata da zero sulle tue indicazioni.'},
      {icon: MessageSquareText, title: 'Bozze da approvare', text: 'Ricevi la bozza nel portale: approvi o chiedi modifiche con un clic, e segui tutto nella timeline.'},
    ],
    cta: {href: '/dashboard/richieste', label: 'Fai una richiesta grafica'},
  },
  {
    id: 'stampa', icon: Printer, label: 'Stampa e ordini', hint: 'Prezzi riservati e priorità',
    title: 'Stampi meglio, paghi meno, ricevi prima',
    intro: 'Sullo shop WowStampa i vantaggi WOWPRO si applicano da soli: tu ordini come sempre, noi ti mettiamo in corsia preferenziale.',
    features: [
      {icon: BadgePercent, title: 'Listino riservato', text: 'Prezzi dedicati su tutto il catalogo, applicati in automatico al checkout.'},
      {icon: Sparkles, title: 'Produzione prioritaria', tag: 'FAST LANE', text: 'I tuoi ordini passano in testa alla coda di stampa.'},
      {icon: Zap, title: 'Spedizione express', tag: '2.000 CREDITI', text: 'Ti serve prima? Sugli ordini dai preventivi richiedi il corriere express con i tuoi crediti.'},
      {icon: Box, title: 'Spedizione white label', text: 'Pacco anonimo e mittente personalizzato: spedisci ai tuoi clienti a tuo nome.'},
      {icon: ScanSearch, title: 'Preventivi rapidi', text: 'Quotazioni su misura per lavori speciali, in tempi brevi.'},
      {icon: Gift, title: 'Promo in anteprima', tag: 'RISERVATO', text: 'Accedi per primo alle offerte dedicate ai clienti WOWPRO.'},
      {icon: PackageCheck, title: 'Ordini sotto controllo', text: 'Stato, spedizione e tracking di ogni ordine direttamente nel portale.'},
    ],
    cta: {href: '/dashboard/ordini', label: 'Vedi i tuoi ordini'},
    secondary: {href: 'https://wowstampa.com', label: 'Vai allo shop', external: true},
  },
  {
    id: 'team', icon: UsersRound, label: 'Il tuo team', hint: 'Persone dedicate a te',
    title: 'Persone vere, che conoscono i tuoi progetti',
    intro: 'Con WOWPRO non parli con un centralino: hai due referenti dedicati che seguono la tua attività nel tempo.',
    features: [
      {icon: Headphones, title: 'Account manager dedicato', text: 'Il tuo riferimento per ordini, preventivi, crediti e abbonamento: chat, email e telefono.'},
      {icon: UserRound, title: 'Grafico dedicato', text: 'Sempre la stessa persona sui tuoi lavori, che conosce il tuo stile e i tuoi file.'},
      {icon: MessageSquareText, title: 'Chat privata', text: 'Scrivi dal portale quando vuoi e ricevi un avviso via email a ogni risposta.'},
      {icon: Lightbulb, title: 'Proponi idee', text: 'Suggerisci nuovi prodotti e funzioni: le idee più votate entrano nella roadmap.'},
    ],
    cta: {href: '/dashboard/supporto', label: 'Contatta il tuo team'},
    secondary: {href: '/dashboard/feedback', label: 'Proponi un’idea'},
  },
  {
    id: 'crediti', icon: Coins, label: 'Crediti', hint: 'Come funzionano',
    title: 'Un plafond mensile, semplice da usare',
    intro: 'Ogni lavoro grafico ha un costo fisso in crediti, così sai sempre quanto spendi. I crediti si scalano da soli quando invii una richiesta.',
    features: [
      {icon: Coins, title: 'Crediti inclusi', text: 'Si rinnovano ogni mese e vengono usati per primi. Non sono cumulabili.'},
      {icon: CreditCard, title: 'Crediti extra', text: 'Ti servono più lavori? Acquistali con carta in pochi secondi: non scadono mai.'},
      {icon: Zap, title: 'Non solo grafica', text: 'Usa i crediti anche per la spedizione express dei tuoi ordini: 2.000 crediti a ordine.'},
      {icon: History, title: 'Storico trasparente', text: 'Ogni movimento, richiesta e ricarica è registrato nello storico crediti.'},
    ],
    cta: {href: '/dashboard/crediti', label: 'Vai ai tuoi crediti'},
  },
];

// Program presentation on the client dashboard: what can be done with WOWPRO, area by area.
export function ProgramShowcase() {
  const [activeId, setActiveId] = useState(AREAS[0].id);
  const area = AREAS.find((item) => item.id === activeId) || AREAS[0];

  return <section className="program" id="programma">
    <header className="program__header">
      <span className="program__eyebrow"><i /> IL PROGRAMMA WOWPRO</span>
      <h2>Cosa puoi fare con WOWPRO</h2>
      <p>Un solo programma per progettare, stampare e spedire: scopri come sfruttarlo al massimo.</p>
    </header>
    <div className="program__body">
      <nav aria-label="Aree del programma" className="program__tabs" role="tablist">
        {AREAS.map(({id, icon: Icon, label, hint}) => <button aria-selected={id === activeId} className={id === activeId ? 'is-active' : ''} key={id} onClick={() => setActiveId(id)} role="tab" type="button"><span><Icon size={20} /></span><strong>{label}<small>{hint}</small></strong></button>)}
      </nav>
      <div className="program__panel" key={area.id} role="tabpanel">
        <h3>{area.title}</h3>
        <p className="program__intro">{area.intro}</p>
        <div className="program__features">
          {area.features.map(({icon: Icon, title, text, tag}) => <article key={title}><span><Icon size={19} /></span><div><h4>{title}{tag ? <small>{tag}</small> : null}</h4><p>{text}</p></div></article>)}
        </div>
        <div className="program__actions">
          <Link className="button button--primary" href={area.cta.href}>{area.cta.label} <ArrowRight size={16} /></Link>
          {area.secondary ? area.secondary.external ? <a className="button program__ghost" href={area.secondary.href} rel="noreferrer" target="_blank">{area.secondary.label}</a> : <Link className="button program__ghost" href={area.secondary.href}>{area.secondary.label}</Link> : null}
        </div>
      </div>
    </div>
  </section>;
}
