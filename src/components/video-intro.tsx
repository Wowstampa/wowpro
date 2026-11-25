'use client';

import {BadgePercent, ChevronUp, Headphones, Palette, Play, Printer, Truck} from 'lucide-react';
import {useRef, useState} from 'react';

const CHAPTERS = [
  {at: 13, icon: Palette, title: 'Grafica inclusa'},
  {at: 19, icon: Headphones, title: 'Account manager dedicato'},
  {at: 24, icon: BadgePercent, title: 'Listino riservato'},
  {at: 29, icon: Printer, title: 'Ordini prioritari'},
  {at: 34, icon: Truck, title: 'Spedizioni express'},
];

// Short presentation video of WOWPRO with navigable chapters. Compact mode starts as a small "quick guide" card.
export function VideoIntro({compact = false}: {compact?: boolean}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [open, setOpen] = useState(!compact);
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

  if (!open) return <section className="video-guide">
    <span className="ws-eyebrow">Guida rapida</span>
    <h3>Scopri come funziona WOWPRO</h3>
    <p>Un unico servizio per semplificare il tuo lavoro quotidiano.</p>
    <button className="video-guide__play" onClick={() => { setOpen(true); setTimeout(() => play(), 50); }} type="button"><span><Play fill="currentColor" size={14} /></span>Guarda il video · 50 sec</button>
  </section>;

  return <section className={compact ? 'video-intro video-intro--compact' : 'video-intro'}>
    <div className={started ? 'video-intro__player is-started' : 'video-intro__player'}>
      <video controls={started} onPlay={() => setStarted(true)} onTimeUpdate={onTime} playsInline poster="/videos/wowpro-intro-poster.jpg" preload="metadata" ref={videoRef} src="/videos/wowpro-intro.mp4" />
      {!started ? <button aria-label="Guarda il video di presentazione di WOWPRO" className="video-intro__play" onClick={() => play()} type="button"><span><Play size={26} fill="currentColor" /></span><small>Guarda il video · 50 secondi</small></button> : null}
    </div>
    <div className="video-intro__copy">
      <span className="ws-eyebrow">WOWPRO in 50 secondi</span>
      <h2>Cosa include WOWPRO</h2>
      <ol className="video-intro__chapters">
        {CHAPTERS.map(({at, icon: Icon, title}, index) => <li key={title}><button className={current === index ? 'is-current' : ''} onClick={() => play(at)} type="button"><span><Icon size={16} /></span><strong>{title}</strong><time>0:{String(at).padStart(2, '0')}</time></button></li>)}
      </ol>
      {compact ? <button className="video-intro__close" onClick={() => { videoRef.current?.pause(); setOpen(false); setStarted(false); }} type="button"><ChevronUp size={15} /> Chiudi il video</button> : null}
    </div>
  </section>;
}
