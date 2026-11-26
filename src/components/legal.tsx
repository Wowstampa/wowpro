import Image from 'next/image';
import Link from 'next/link';

import {LEGAL_DETAILS} from '@/lib/legal-details';

export const LEGAL = {...LEGAL_DETAILS, updated: '26 novembre 2026'};

// Shared frame for the public legal pages of the portal.
export function LegalPage({title, intro, children}: {title: string; intro: string; children: React.ReactNode}) {
  return <main className="legal">
    <header className="legal__top"><Link aria-label="WOWPRO" href="/"><Image alt="WOWPRO" height={40} priority src="/images/wowpro-logo.svg" unoptimized width={114} /></Link><nav><Link href="/privacy">Privacy</Link><Link href="/cookie">Cookie</Link><Link href="/termini">Termini del servizio</Link></nav></header>
    <article className="legal__body">
      <span className="legal__eyebrow">WOWPRO · Documenti legali</span>
      <h1>{title}</h1>
      <p className="legal__intro">{intro}</p>
      <p className="legal__updated">Ultimo aggiornamento: {LEGAL.updated}</p>
      {children}
    </article>
    <LegalFooter />
  </main>;
}

export function LegalFooter({compact = false}: {compact?: boolean}) {
  return <footer className={compact ? 'legal-footer legal-footer--compact' : 'legal-footer'}>
    <span>© {new Date().getFullYear()} {LEGAL.company} · P.IVA {LEGAL.vat}</span>
    <nav><Link href="/privacy">Privacy</Link><Link href="/cookie">Cookie</Link><Link href="/termini">Termini</Link></nav>
  </footer>;
}
