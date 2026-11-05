'use client';

import {useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent} from 'react';
import {CalendarDays, CheckCircle2, CircleDot, Eye, FileText, Loader2, Lock, Play, RotateCcw, Send, ThumbsUp, Upload, User, Wrench, X, XCircle} from 'lucide-react';

import {AddFilesButton, FileList, formatBytes, type RequestFileItem} from '@/components/request-files';

type Status = 'new' | 'in_progress' | 'review' | 'completed' | 'rejected';
type Item =
  | {kind: 'comment'; id: string; at: string; body: string; internal: boolean; authorName: string; fromClient: boolean; mine: boolean}
  | {kind: 'event'; id: string; at: string; text: string; tone: string; authorName: string}
  | {kind: 'file'; id: string; at: string; name: string; size: number; authorName: string; fromClient: boolean};
type Thread = {
  request: {id: string; publicId: string; title: string; brief: string; type: string; status: Status; creditCost: number; createdAt: string; completedAt: string | null; dueDate: string | null; priority: string; awaitingClient: boolean; companyName: string; requesterName: string; designerName: string | null; designerId: string | null};
  designers: Array<{id: string; name: string}>;
  files: RequestFileItem[];
  timeline: Item[];
};

export const REQUEST_STATUS_LABELS: Record<Status, string> = {new: 'Nuova', in_progress: 'In lavorazione', review: 'Bozza da approvare', completed: 'Completata', rejected: 'Rifiutata'};
const STEPS: Status[] = ['new', 'in_progress', 'review', 'completed'];

export function RequestThread({requestId, viewer, canReject = false, onStatusChange}: {requestId: string; viewer: 'client' | 'team'; canReject?: boolean; onStatusChange?: (status: Status) => void}) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState('');
  const [comment, setComment] = useState('');
  const [internal, setInternal] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isActing, setIsActing] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const timelineEnd = useRef<HTMLDivElement>(null);
  const lastLength = useRef(0);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/requests/${requestId}/thread`, {cache: 'no-store'});
      const result = await response.json() as Thread & {error?: string};
      if (!response.ok) throw new Error(result.error || 'Richiesta non disponibile.');
      setThread(result); setError('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Richiesta non disponibile.'); }
  }, [requestId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch of external data
    void load();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 10_000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const length = thread?.timeline.length || 0;
    if (length > lastLength.current && lastLength.current) timelineEnd.current?.scrollIntoView({behavior: 'smooth', block: 'nearest'});
    lastLength.current = length;
  }, [thread]);

  async function act(action: string, note?: string) {
    setIsActing(true); setError('');
    try {
      const response = await fetch(`/api/requests/${requestId}/status`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action, comment: note})});
      const result = await response.json() as {status?: Status; error?: string};
      if (!response.ok || !result.status) throw new Error(result.error || 'Azione non riuscita.');
      onStatusChange?.(result.status);
      setChangesOpen(false);
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Azione non riuscita.'); } finally { setIsActing(false); }
  }

  async function assign(designerId: string) {
    setIsActing(true); setError('');
    try {
      const response = await fetch(`/api/requests/${requestId}/assign`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({designerId})});
      const result = await response.json() as {error?: string};
      if (!response.ok) throw new Error(result.error || 'Assegnazione non riuscita.');
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Assegnazione non riuscita.'); } finally { setIsActing(false); }
  }

  async function sendComment(event?: FormEvent) {
    event?.preventDefault();
    const body = comment.trim();
    if (!body || isSending) return;
    setIsSending(true); setError('');
    try {
      const response = await fetch(`/api/requests/${requestId}/comments`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({body, internal})});
      const result = await response.json() as {error?: string};
      if (!response.ok) throw new Error(result.error || 'Commento non inviato.');
      setComment(''); setInternal(false);
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Commento non inviato.'); } finally { setIsSending(false); }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void sendComment(); }
  }

  if (!thread) return <div className="rt-loading">{error ? <p className="form-error">{error}</p> : <><Loader2 className="spin" size={20} /> Caricamento richiesta…</>}</div>;
  const {request} = thread;
  const stepIndex = STEPS.indexOf(request.status);

  return <div className="rt">
    <header className="rt-head">
      <div className="rt-head__top"><span className="rt-id">{request.publicId}</span><span className={`rt-status rt-status--${request.status}`}>{REQUEST_STATUS_LABELS[request.status]}</span></div>
      <h2>{request.title}</h2>
      <div className="rt-meta">
        <span><CircleDot size={14} />{request.type} · {request.creditCost.toLocaleString('it-IT')} crediti</span>
        {viewer === 'team' ? <span><User size={14} />{request.companyName} · {request.requesterName}</span> : null}
        {thread.designers.length ? <label className="rt-assign"><Wrench size={14} />Grafico<select disabled={isActing} onChange={(event) => void assign(event.target.value)} value={request.designerId || ''}><option value="">Da assegnare</option>{thread.designers.map((designer) => <option key={designer.id} value={designer.id}>{designer.name}</option>)}</select></label> : <span><Wrench size={14} />{request.designerName ? `Grafico: ${request.designerName}` : 'Grafico da assegnare'}</span>}
        <span><CalendarDays size={14} />Inviata il {longDate(request.createdAt)}</span>
        {request.dueDate ? <span><CalendarDays size={14} />Scadenza {longDate(request.dueDate)}</span> : null}
      </div>
      {request.status !== 'rejected' ? <ol className="rt-steps">{STEPS.map((step, index) => <li className={index < stepIndex ? 'is-done' : index === stepIndex ? 'is-current' : ''} key={step}><i>{index < stepIndex ? <CheckCircle2 size={14} /> : index + 1}</i>{REQUEST_STATUS_LABELS[step]}</li>)}</ol> : null}
    </header>

    <ActionBar canReject={canReject} changesOpen={changesOpen} isActing={isActing} onAct={act} onToggleChanges={setChangesOpen} status={request.status} viewer={viewer} />

    <section className="rt-section"><h3>Brief</h3><p className="rt-brief">{request.brief}</p></section>

    <section className="rt-section"><h3>File <small>{thread.files.length}</small></h3>{thread.files.length ? <FileList files={thread.files} /> : <p className="rt-muted">Nessun file allegato.</p>}<AddFilesButton key={request.id} onUploaded={() => void load()} requestId={request.id} /></section>

    <section className="rt-section">
      <h3>Attività</h3>
      <ol className="rt-timeline">
        {thread.timeline.map((item) => <TimelineEntry item={item} key={`${item.kind}-${item.id}`} viewer={viewer} />)}
        {!thread.timeline.length ? <li className="rt-muted">Ancora nessuna attività.</li> : null}
      </ol>
      <div ref={timelineEnd} />
    </section>

    <form className={internal ? 'rt-composer is-internal' : 'rt-composer'} onSubmit={sendComment}>
      <textarea maxLength={2000} onChange={(event) => setComment(event.target.value)} onKeyDown={onKeyDown} placeholder={internal ? 'Nota interna: visibile solo al team…' : viewer === 'client' ? 'Scrivi un commento per il grafico…' : 'Scrivi un commento per il cliente…'} rows={3} value={comment} />
      {error ? <p className="form-error">{error}</p> : null}
      <div className="rt-composer__bar">
        {viewer === 'team' ? <label className="rt-internal"><input checked={internal} onChange={(event) => setInternal(event.target.checked)} type="checkbox" /><Lock size={13} /> Nota interna</label> : <small>Ctrl/⌘ + Invio per inviare</small>}
        <button className="client-action client-action--primary" disabled={isSending || !comment.trim()} type="submit">{isSending ? <Loader2 className="spin" size={15} /> : <Send size={15} />}{internal ? 'Salva nota' : 'Invia commento'}</button>
      </div>
    </form>
  </div>;
}

function ActionBar({canReject, changesOpen, isActing, onAct, onToggleChanges, status, viewer}: {canReject: boolean; changesOpen: boolean; isActing: boolean; onAct: (action: string, note?: string) => void; onToggleChanges: (open: boolean) => void; status: Status; viewer: 'client' | 'team'}) {
  const [note, setNote] = useState('');
  if (viewer === 'client') {
    if (status !== 'review') return null;
    return <section className="rt-approval">
      <div><strong><Eye size={16} /> La bozza è pronta</strong><p>Controlla i file più recenti: se va bene approvala, altrimenti descrivi cosa cambiare.</p></div>
      {changesOpen ? <div className="rt-approval__changes"><textarea onChange={(event) => setNote(event.target.value)} placeholder="Cosa vorresti modificare?" rows={3} value={note} /><div><button className="client-action" onClick={() => onToggleChanges(false)} type="button"><X size={15} />Annulla</button><button className="client-action client-action--primary" disabled={isActing || !note.trim()} onClick={() => onAct('request_changes', note.trim())} type="button"><Send size={15} />Invia richiesta di modifiche</button></div></div>
        : <div className="rt-approval__actions"><button className="client-action" disabled={isActing} onClick={() => onToggleChanges(true)} type="button"><RotateCcw size={15} />Richiedi modifiche</button><button className="client-action client-action--primary" disabled={isActing} onClick={() => onAct('approve')} type="button"><ThumbsUp size={15} />Approva la bozza</button></div>}
    </section>;
  }
  return <section className="rt-actions">
    {status === 'new' ? <button className="client-action" disabled={isActing} onClick={() => onAct('start')} type="button"><Play size={15} />Prendi in carico</button> : null}
    {status === 'new' || status === 'in_progress' ? <button className="client-action client-action--violet" disabled={isActing} onClick={() => onAct('send_review')} type="button"><Upload size={15} />Invia bozza al cliente</button> : null}
    {status !== 'completed' && status !== 'rejected' ? <button className="client-action client-action--primary" disabled={isActing} onClick={() => onAct('complete')} type="button"><CheckCircle2 size={15} />Segna completata</button> : null}
    {status === 'review' || status === 'completed' || status === 'rejected' ? <button className="client-action" disabled={isActing} onClick={() => onAct('reopen')} type="button"><RotateCcw size={15} />Riapri</button> : null}
    {canReject && status !== 'rejected' && status !== 'completed' ? <button className="client-action client-action--danger" disabled={isActing} onClick={() => onAct('reject')} type="button"><XCircle size={15} />Rifiuta</button> : null}
    {isActing ? <Loader2 className="spin" size={16} /> : null}
    <small>Carica la bozza tra i file, poi usa «Invia bozza al cliente»: riceverà un’email per approvarla.</small>
  </section>;
}

function TimelineEntry({item, viewer}: {item: Item; viewer: 'client' | 'team'}) {
  if (item.kind === 'event') return <li className={`rt-event rt-event--${item.tone}`}><span className="rt-dot" /><p>{item.text}</p><time>{longDate(item.at, true)}</time></li>;
  if (item.kind === 'file') return <li className="rt-event rt-event--file"><span className="rt-dot"><FileText size={11} /></span><p><b>{item.authorName}</b> ha caricato <a href={`/api/files/${item.id}`} rel="noreferrer" target="_blank">{item.name}</a> <small>{formatBytes(item.size)}</small></p><time>{longDate(item.at, true)}</time></li>;
  const side = viewer === 'client' ? item.fromClient : !item.fromClient;
  return <li className={`rt-comment${side ? ' rt-comment--mine' : ''}${item.internal ? ' rt-comment--internal' : ''}`}>
    <span className="rt-avatar">{initials(item.authorName)}</span>
    <div><header><b>{item.authorName}</b>{item.internal ? <em><Lock size={11} /> Nota interna</em> : null}<time>{longDate(item.at, true)}</time></header><p>{item.body}</p></div>
  </li>;
}

export function RequestDrawer({children, onClose}: {children: React.ReactNode; onClose: () => void}) {
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);
  return <div className="rt-drawer" role="dialog" aria-modal="true"><button aria-label="Chiudi" className="rt-drawer__backdrop" onClick={onClose} type="button" /><aside className="rt-drawer__panel"><button aria-label="Chiudi richiesta" className="rt-drawer__close" onClick={onClose} type="button"><X size={19} /></button>{children}</aside></div>;
}

// Opens the request referenced by ?r= in the URL (used by email links).
export function useRequestFromUrl(open: (id: string) => void) {
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('r');
    if (id) open(id);
  }, [open]);
}

function initials(value: string) { return value.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
function longDate(value: string, withTime = false) { return new Intl.DateTimeFormat('it-IT', withTime ? {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'} : {day: 'numeric', month: 'short', year: 'numeric'}).format(new Date(value)); }
