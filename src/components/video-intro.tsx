'use client';

import {BadgePercent, Headphones, Palette, Play, Printer, Truck} from 'lucide-react';
import {useRef, useState} from 'react';

const CHAPTERS = [
  {at: 13, icon: Palette, title: 'Grafica inclusa', text: 'Crediti ogni mese per revisioni, modifiche e creazioni.'},
  {at: 19, icon: Headphones, title: 'Un commerciale tutto tuo', text: 'Un account manager dedicato, in chat e al telefono.'},
  {at: 24, icon: BadgePercent, title: 'Listino riservato', text: 'Prezzi scontati solo per te, già applicati al checkout.'},
  {at: 29, icon: Printer, title: 'Ordini prioritari', text: 'Servizio Priority: i tuoi ordini passano davanti.'},
  {at: 34, icon: Truck, title: 'Spedizioni express', text: 'Spedizioni più veloci per i tuoi ordini.'},
];

// Short presentation video of the WOWPRO program, with clickable chapters.
export function VideoIntro() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [current, setCurrent] = useState(-1);

  function play(at?: number) {
    const video = videoRef.current;
    if (!video) return;
    if (typeof at === 'number') video.currentTime = at;
    setStarted(true);
    void video.play().catch(() => { /* Autoplay restrictions: the native controls remain available. */ });
  }

  function onTime() {
    const time = videoRef.current?.currentTime || 0;
    let index = -1;
    CHAPTERS.forEach((chapter, position) => { if (time >= chapter.at && time < 41) index = position; });
    setCurrent(index);
  }

  return <section className="video-intro">
    <div className={started ? 'video-intro__player is-started' : 'video-intro__player'}>
      <video controls={started} onPlay={() => setStarted(true)} onTimeUpdate={onTime} playsInline poster="/videos/wowpro-intro-poster.jpg" preload="metadata" ref={videoRef} src="/videos/wowpro-intro.mp4" />
      {!started ? <button aria-label="Guarda il video di presentazione di WOWPRO" className="video-intro__play" onClick={() => play()} type="button"><span><Play size={28} fill="currentColor" /></span><small>Guarda il video · 50 secondi</small></button> : null}
    </div>
    <div className="video-intro__copy">
      <span className="video-intro__eyebrow"><i /> WOWPRO IN 50 SECONDI</span>
      <h2>Un abbonamento,<br /><em>cinque vantaggi.</em></h2>
      <p>Guarda come funziona il programma e salta direttamente al vantaggio che ti interessa.</p>
      <ol className="video-intro__chapters">
        {CHAPTERS.map(({at, icon: Icon, title, text}, index) => <li key={title}><button className={current === index ? 'is-current' : ''} onClick={() => play(at)} type="button"><span><Icon size={17} /></span><strong>{title}<small>{text}</small></strong><time>0:{String(at).padStart(2, '0')}</time></button></li>)}
      </ol>
    </div>
  </section>;
}
