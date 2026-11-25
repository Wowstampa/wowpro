'use client';

import {ArrowRight, Check, MessageCircle, Palette, Printer, Rocket, X} from 'lucide-react';
import Link from 'next/link';
import {useEffect, useState} from 'react';

import {OpenChatButton} from '@/components/support-widget';

type Steps = {brandKit: boolean; graphic: boolean; quote: boolean; chat: boolean};
const KEY = 'wowpro:onboarding-hidden';

// First steps for a new subscriber: disappears once everything is done (or when the client hides it).
export function DashboardOnboarding({steps}: {steps: Steps}) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- per-browser preference read after hydration
    try { setHidden(window.localStorage.getItem(KEY) === '1'); } catch { /* Storage unavailable: keep it visible. */ }
  }, []);
  const items = [
    {done: steps.brandKit, title: 'Completa il brand kit', text: 'Logo, colori e font sempre pronti per il grafico.', icon: Palette, href: '/dashboard/brand-kit', cta: 'Carica il logo'},
    {done: steps.graphic, title: 'Invia la prima richiesta grafica', text: 'Revisione, modifica o creazione da zero.', icon: Rocket, href: '/dashboard/richieste?new=grafica', cta: 'Nuova grafica'},
    {done: steps.quote, title: 'Chiedi il primo preventivo di stampa', text: 'Con i prezzi riservati WOWPRO.', icon: Printer, href: '/dashboard/richieste?tab=preventivi&new=quote', cta: 'Chiedi preventivo'},
    {done: steps.chat, title: 'Presentati al tuo account manager', text: 'Raccontaci la tua azienda e le prossime scadenze.', icon: MessageCircle, href: null, cta: 'Scrivi'},
  ];
  const completed = items.filter((item) => item.done).length;
  if (hidden || completed === items.length) return null;
  const hide = () => { setHidden(true); try { window.localStorage.setItem(KEY, '1'); } catch { /* Hidden for this visit only. */ } };

  return <section className="dash-onboarding">
    <header>
      <div className="dash-ring" style={{['--p' as string]: `${(completed / items.length) * 100}%`}}><span>{completed}/{items.length}</span></div>
      <div><small>Primi passi</small><h3>Configura il tuo workspace WOWPRO</h3><p>Quattro passaggi per lavorare al meglio con il tuo team dedicato.</p></div>
      <button aria-label="Nascondi" className="dash-onboarding__hide" onClick={hide} type="button"><X size={16} /></button>
    </header>
    <ol>{items.map((item) => {
      const Icon = item.icon;
      const action = item.done ? <span className="dash-onboarding__done"><Check size={14} /> Fatto</span>
        : item.href ? <Link className="dash-onboarding__cta" href={item.href}>{item.cta} <ArrowRight size={14} /></Link>
        : <OpenChatButton className="dash-onboarding__cta">{item.cta} <ArrowRight size={14} /></OpenChatButton>;
      return <li className={item.done ? 'is-done' : ''} key={item.title}><span className="dash-onboarding__icon">{item.done ? <Check size={18} /> : <Icon size={18} />}</span><div><strong>{item.title}</strong><small>{item.text}</small></div>{action}</li>;
    })}</ol>
  </section>;
}
