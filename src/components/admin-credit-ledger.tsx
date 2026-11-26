'use client';

import Link from 'next/link';
import {BadgeEuro, CalendarDays, Coins, Search, Sparkles, UsersRound} from 'lucide-react';
import {useState} from 'react';

export type CreditLedgerEntry = {
  id: string;
  companyName: string;
  bucket: 'included' | 'extra';
  amount: number;
  description: string;
  createdAt: string;
  createdBy: string;
};

export function AdminCreditLedger({entries}: {entries: CreditLedgerEntry[]}) {
  const [query, setQuery] = useState('');
  const [bucket, setBucket] = useState<'all' | 'included' | 'extra'>('all');
  const normalizedQuery = query.trim().toLocaleLowerCase('it-IT');
  const visibleEntries = entries.filter((entry) => {
    const matchesBucket = bucket === 'all' || entry.bucket === bucket;
    const matchesQuery = !normalizedQuery || [entry.companyName, entry.description, entry.createdBy]
      .some((value) => value.toLocaleLowerCase('it-IT').includes(normalizedQuery));
    return matchesBucket && matchesQuery;
  });
  const currentMonth = new Date();
  const currentMonthEntries = entries.filter((entry) => sameMonth(entry.createdAt, currentMonth));
  const monthlyTotal = currentMonthEntries.reduce((total, entry) => total + entry.amount, 0);
  const extraTotal = currentMonthEntries.filter((entry) => entry.bucket === 'extra').reduce((total, entry) => total + entry.amount, 0);
  const activeCompanies = new Set(currentMonthEntries.map((entry) => entry.companyName)).size;

  return (
    <>
      <section className="credit-overview" aria-label="Riepilogo crediti">
        <CreditMetric icon={<BadgeEuro />} label="Crediti caricati" note="nel mese corrente" value={formatNumber(monthlyTotal)} />
        <CreditMetric icon={<Sparkles />} label="Crediti extra" note="non soggetti a scadenza" tone="violet" value={formatNumber(extraTotal)} />
        <CreditMetric icon={<UsersRound />} label="Clienti movimentati" note="nel mese corrente" tone="blue" value={String(activeCompanies)} />
        <CreditMetric icon={<CalendarDays />} label="Movimenti registrati" note="dall'avvio del portale" tone="amber" value={String(entries.length)} />
      </section>

      <section className="credit-ledger-toolbar">
        <div><span className="eyebrow">STORICO MOVIMENTI</span><h2>Registro crediti</h2><p>Ogni accredito effettuato dallo staff viene registrato qui.</p></div>
        <Link className="button button--primary" href="/admin/clienti"><Coins size={17} />Ricarica crediti</Link>
      </section>

      <section className="credit-ledger" aria-label="Storico movimenti crediti">
        <div className="credit-ledger__filters">
          <label className="client-search"><Search size={17} /><input onChange={(event) => setQuery(event.target.value)} placeholder="Cerca cliente o motivazione..." value={query} /></label>
          <div className="credit-filter" role="group" aria-label="Filtra per tipo di credito">
            <button className={bucket === 'all' ? 'is-selected' : ''} onClick={() => setBucket('all')} type="button">Tutti</button>
            <button className={bucket === 'included' ? 'is-selected' : ''} onClick={() => setBucket('included')} type="button">Inclusi</button>
            <button className={bucket === 'extra' ? 'is-selected' : ''} onClick={() => setBucket('extra')} type="button">Extra</button>
          </div>
        </div>
        <div className="credit-ledger__head"><span>Data</span><span>Cliente</span><span>Motivazione</span><span>Tipo</span><span>Operatore</span><span>Credito</span></div>
        {visibleEntries.map((entry) => <CreditLedgerRow entry={entry} key={entry.id} />)}
        {!visibleEntries.length ? <div className="credit-ledger__empty"><Coins size={22} /><strong>Nessun movimento trovato</strong><p>{entries.length ? 'Modifica i filtri o la ricerca per vedere altri movimenti.' : 'Gli accrediti effettuati sui clienti compariranno qui.'}</p></div> : null}
      </section>
    </>
  );
}

function CreditLedgerRow({entry}: {entry: CreditLedgerEntry}) {
  return <article className="credit-ledger__row">
    <div><strong>{formatDate(entry.createdAt)}</strong><small>{formatTime(entry.createdAt)}</small></div>
    <div><strong>{entry.companyName}</strong></div>
    <p>{entry.description}</p>
    <span className={entry.bucket === 'extra' ? 'credit-type credit-type--extra' : 'credit-type'}>{entry.bucket === 'extra' ? 'Extra' : 'Inclusi'}</span>
    <span className="credit-operator">{entry.createdBy}</span>
    <strong className="credit-amount">+{formatNumber(entry.amount)}</strong>
  </article>;
}

function CreditMetric({icon, label, note, tone = 'green', value}: {icon: React.ReactNode; label: string; note: string; tone?: string; value: string}) {
  return <article className="credit-overview__metric"><span className={`metric-icon metric-icon--${tone}`}>{icon}</span><p>{label}</p><strong>{value}</strong><small>{note}</small></article>;
}

function sameMonth(value: string, date: Date) {
  const entryDate = new Date(value);
  return entryDate.getMonth() === date.getMonth() && entryDate.getFullYear() === date.getFullYear();
}

function formatDate(value: string) { return new Intl.DateTimeFormat('it-IT', {day: '2-digit', month: 'short', year: 'numeric'}).format(new Date(value)); }
function formatTime(value: string) { return new Intl.DateTimeFormat('it-IT', {hour: '2-digit', minute: '2-digit'}).format(new Date(value)); }
function formatNumber(value: number) { return new Intl.NumberFormat('it-IT', {useGrouping: 'always'} as Intl.NumberFormatOptions).format(value); }
