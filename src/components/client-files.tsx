'use client';

import {ArrowRight, Download, FileArchive, FileImage, FileText, FolderOpen, Printer, Search} from 'lucide-react';
import Link from 'next/link';
import {useMemo, useState} from 'react';

import {formatBytes} from '@/components/request-files';

type Group = {requestId: string; publicId: string; title: string; status: string; at: string; files: Array<{id: string; name: string; size: number; createdAt: string}>};

const STATUS: Record<string, {label: string; tone: string}> = {completed: {label: 'Approvata', tone: 'done'}, review: {label: 'Bozza da approvare', tone: 'action'}, in_progress: {label: 'In lavorazione', tone: 'info'}, new: {label: 'Ricevuta', tone: 'info'}, rejected: {label: 'Annullata', tone: 'muted'}};
const day = (value: string) => new Intl.DateTimeFormat('it-IT', {day: 'numeric', month: 'short', year: 'numeric'}).format(new Date(value));
const iconFor = (name: string) => /\.(png|jpe?g|webp|svg|tiff?)$/i.test(name) ? FileImage : /\.zip$/i.test(name) ? FileArchive : FileText;

// All the graphics the team delivered, in one place: download again or send to print.
export function ClientFiles({groups}: {groups: Group[]}) {
  const [term, setTerm] = useState('');
  const [onlyFinal, setOnlyFinal] = useState(false);
  const visible = useMemo(() => {
    const query = term.trim().toLowerCase();
    return groups.filter((group) => (!onlyFinal || group.status === 'completed') && (!query || `${group.publicId} ${group.title} ${group.files.map((file) => file.name).join(' ')}`.toLowerCase().includes(query)));
  }, [groups, term, onlyFinal]);
  const total = groups.reduce((sum, group) => sum + group.files.length, 0);

  if (!groups.length) return <section className="dash-empty files-empty"><span><FolderOpen size={24} /></span><strong>Ancora nessun file</strong><p>Bozze e grafiche definitive che il team ti consegna compariranno qui, pronte da scaricare.</p><Link className="dash-btn dash-btn--primary dash-btn--sm" href="/dashboard/richieste?new=grafica">Richiedi una grafica <ArrowRight size={15} /></Link></section>;

  return <section className="files">
    <div className="files__toolbar">
      <label className="files__search"><Search size={16} /><input onChange={(event) => setTerm(event.target.value)} placeholder="Cerca per nome, file o codice richiesta" type="search" value={term} /></label>
      <div className="files__filters" role="tablist"><button aria-selected={!onlyFinal} className={!onlyFinal ? 'is-active' : ''} onClick={() => setOnlyFinal(false)} role="tab" type="button">Tutti <small>{total}</small></button><button aria-selected={onlyFinal} className={onlyFinal ? 'is-active' : ''} onClick={() => setOnlyFinal(true)} role="tab" type="button">Solo approvate</button></div>
    </div>
    <div className="files__grid">{visible.map((group) => {
      const status = STATUS[group.status] || STATUS.new;
      return <article className="files-card" key={group.requestId}>
        <header><div><small>{group.publicId} · {day(group.at)}</small><Link href={`/dashboard/richieste?r=${group.requestId}`}>{group.title}</Link></div><b className={`files-status files-status--${status.tone}`}>{status.label}</b></header>
        <ul>{group.files.map((file) => { const Icon = iconFor(file.name); return <li key={file.id}><Icon size={18} /><div><strong title={file.name}>{file.name}</strong><small>{formatBytes(file.size)} · {day(file.createdAt)}</small></div><a aria-label={`Scarica ${file.name}`} className="files-card__download" href={`/api/files/${file.id}`}><Download size={16} /></a></li>; })}</ul>
        {group.status === 'completed' ? <Link className="files-card__print" href={`/dashboard/richieste?tab=preventivi&stampa=${group.requestId}`}><Printer size={15} /> Ordina la stampa <ArrowRight size={14} /></Link> : null}
      </article>;
    })}</div>
    {!visible.length ? <p className="bk-none">Nessun file corrisponde alla ricerca.</p> : null}
  </section>;
}
