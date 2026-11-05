'use client';

import {CalendarDays, Check, MessageCircle, Search, Send, X} from 'lucide-react';
import {FormEvent, useState} from 'react';

import {AddFilesButton, FileList, type RequestFileItem} from '@/components/request-files';

export type GraphicRequest = {
  id: string;
  publicId: string;
  title: string;
  brief: string;
  companyName: string;
  contactName: string;
  status: 'new' | 'in_progress' | 'completed' | 'rejected';
  priority: 'low' | 'medium' | 'high';
  dueDate: string | null;
  createdAt: string;
  awaitingClientResponse: boolean;
  messages: Array<{id: string; body: string; createdAt: string}>;
  files: RequestFileItem[];
};

const statusLabels: Record<GraphicRequest['status'], string> = {new: 'Da iniziare', in_progress: 'In lavorazione', completed: 'Completata', rejected: 'Rifiutata'};

export function GraphicRequestBoard({initialRequests}: {initialRequests: GraphicRequest[]}) {
  const [requests, setRequests] = useState(initialRequests);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | GraphicRequest['status']>('all');
  const [sort, setSort] = useState<'due' | 'priority' | 'recent'>('due');
  const [messagingRequest, setMessagingRequest] = useState<GraphicRequest | null>(null);
  const [error, setError] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase('it-IT');
  const visibleRequests = requests.filter((request) => (filter === 'all' || request.status === filter) && (!normalizedQuery || [request.publicId, request.title, request.companyName].some((value) => value.toLocaleLowerCase('it-IT').includes(normalizedQuery)))).sort(sortRequests(sort));

  async function acknowledge(requestId: string) {
    setError('');
    try {
      const response = await fetch(`/api/operator/requests/${requestId}/awaiting-response`, {method: 'POST'});
      const result = await readResponse(response);
      if (!response.ok) throw new Error(result.error || 'Aggiornamento non riuscito.');
      setRequests((current) => current.map((request) => request.id === requestId ? {...request, awaitingClientResponse: false} : request));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Aggiornamento non riuscito.'); }
  }

  return <><section className="graphic-request-toolbar"><div><span className="eyebrow">IL TUO LAVORO</span><h2>Richieste assegnate</h2><p>Consulta i dettagli e aggiorna il cliente con un messaggio.</p></div><label className="graphic-sort">Ordina per<select onChange={(event) => setSort(event.target.value as typeof sort)} value={sort}><option value="due">Scadenza</option><option value="priority">Priorità</option><option value="recent">Più recenti</option></select></label></section>{error ? <p className="directory-error">{error}</p> : null}
    <section className="graphic-request-filterbar"><label className="client-search"><Search size={17} /><input onChange={(event) => setQuery(event.target.value)} placeholder="Cerca titolo, ID o cliente..." value={query} /></label><div className="credit-filter" role="group" aria-label="Filtra richieste"><button className={filter === 'all' ? 'is-selected' : ''} onClick={() => setFilter('all')} type="button">Tutte</button><button className={filter === 'new' ? 'is-selected' : ''} onClick={() => setFilter('new')} type="button">Nuove</button><button className={filter === 'in_progress' ? 'is-selected' : ''} onClick={() => setFilter('in_progress')} type="button">In lavorazione</button><button className={filter === 'completed' ? 'is-selected' : ''} onClick={() => setFilter('completed')} type="button">Completate</button></div></section>
    <section className="graphic-request-list">{visibleRequests.map((request) => <GraphicRequestCard key={request.id} onAcknowledge={() => acknowledge(request.id)} onFilesAdded={(files) => setRequests((current) => current.map((item) => item.id === request.id ? {...item, files: [...item.files, ...files]} : item))} onMessage={() => setMessagingRequest(request)} request={request} />)}{!visibleRequests.length ? <p className="client-list__empty">Nessuna richiesta corrisponde ai filtri.</p> : null}</section>
    {messagingRequest ? <MessageModal request={messagingRequest} onClose={() => setMessagingRequest(null)} onError={setError} onSent={(message) => { setRequests((current) => current.map((request) => request.id === messagingRequest.id ? {...request, awaitingClientResponse: true, messages: [...request.messages, message]} : request)); setMessagingRequest(null); }} /> : null}
  </>;
}

function GraphicRequestCard({onAcknowledge, onFilesAdded, onMessage, request}: {onAcknowledge: () => void; onFilesAdded: (files: RequestFileItem[]) => void; onMessage: () => void; request: GraphicRequest}) {
  return <article className="graphic-request-card"><div className="graphic-request-card__main"><div className="graphic-card-meta"><span className="admin-row__id">{request.publicId}</span><span className={`feedback-status feedback-status--${statusClass(request.status)}`}>{statusLabels[request.status]}</span><span className={`priority-chip priority-chip--${request.priority}`}>{priorityLabel(request.priority)}</span></div><h3>{request.title}</h3><p>{request.brief}</p><div className="graphic-request-files"><span className="eyebrow">FILE ALLEGATI</span>{request.files.length ? <FileList files={request.files} /> : <p className="message-empty">Nessun file allegato.</p>}<AddFilesButton onUploaded={onFilesAdded} requestId={request.id} /></div><div className="graphic-request-details"><span>{request.companyName}</span><span>{request.contactName}</span><span><CalendarDays size={14} />{request.dueDate ? `Scadenza ${formatDate(request.dueDate)}` : 'Nessuna scadenza'}</span></div>{request.awaitingClientResponse ? <div className="awaiting-row"><span>In attesa di risposta cliente</span><button onClick={onAcknowledge} type="button"><Check size={14} />Segna come risposto</button></div> : null}</div><aside className="graphic-request-card__side"><div><span className="eyebrow">STATO LAVORAZIONE</span><strong>{statusLabels[request.status]}</strong></div><div><span className="eyebrow">MESSAGGI AL CLIENTE</span>{request.messages.length ? <div className="message-thread">{request.messages.slice(-2).map((message) => <div className="message-bubble" key={message.id}><small>{formatDate(message.createdAt)}</small><p>{message.body}</p></div>)}</div> : <p className="message-empty">Nessun messaggio inviato.</p>}</div><button className="button graphic-message-button" onClick={onMessage} type="button"><MessageCircle size={16} />Scrivi messaggio al cliente</button></aside></article>;
}

function MessageModal({onClose, onError, onSent, request}: {onClose: () => void; onError: (error: string) => void; onSent: (message: GraphicRequest['messages'][number]) => void; request: GraphicRequest}) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSending, setIsSending] = useState(false);
  async function send(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!message.trim()) return; setIsSending(true); setError(''); onError(''); try { const response = await fetch(`/api/operator/requests/${request.id}/messages`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({message})}); const result = await readResponse(response); if (!response.ok || !result.message) throw new Error(result.error || 'Invio non riuscito.'); onSent({id: result.message.id, body: result.message.body, createdAt: result.message.created_at}); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Invio non riuscito.'); } finally { setIsSending(false); } }
  return <div aria-modal="true" className="modal-backdrop" role="dialog"><section className="client-modal"><header><div><h2>Messaggio al cliente</h2><p>{request.publicId} · {request.title}</p></div><button aria-label="Chiudi" className="modal-close" onClick={onClose} type="button"><X size={19} /></button></header><form className="client-form" onSubmit={send}>{request.messages.length ? <div className="client-form__wide message-thread">{request.messages.map((item) => <div className="message-bubble" key={item.id}><small>{formatDate(item.createdAt)}</small><p>{item.body}</p></div>)}</div> : null}<label className="client-form__wide">Nuovo messaggio<textarea onChange={(event) => setMessage(event.target.value)} placeholder="Scrivi un aggiornamento chiaro per il cliente..." required rows={5} value={message} /></label><p className="form-hint">Il cliente lo vedrà nel portale collegato a questa richiesta.</p>{error ? <p className="form-error">{error}</p> : null}<footer className="modal-actions"><span className="modal-client-hint">Visibile al cliente nel portale.</span><button className="client-action" disabled={isSending} onClick={onClose} type="button">Annulla</button><button className="client-action client-action--primary" disabled={!message.trim() || isSending} type="submit"><Send size={15} />{isSending ? 'Invio...' : 'Invia messaggio'}</button></footer></form></section></div>;
}

function sortRequests(sort: 'due' | 'priority' | 'recent') { return (first: GraphicRequest, second: GraphicRequest) => { if (sort === 'recent') return Date.parse(second.createdAt) - Date.parse(first.createdAt); if (sort === 'priority') return priorityScore(second.priority) - priorityScore(first.priority); return (first.dueDate ? Date.parse(first.dueDate) : Number.MAX_SAFE_INTEGER) - (second.dueDate ? Date.parse(second.dueDate) : Number.MAX_SAFE_INTEGER); }; }
function priorityScore(value: GraphicRequest['priority']) { return {high: 3, medium: 2, low: 1}[value]; }
function statusClass(value: GraphicRequest['status']) { return value === 'in_progress' ? 'evaluating' : value === 'completed' ? 'completed' : value === 'rejected' ? 'rejected' : 'new'; }
function priorityLabel(value: GraphicRequest['priority']) { return {high: 'Priorità alta', medium: 'Priorità media', low: 'Priorità bassa'}[value]; }
function formatDate(value: string) { return new Intl.DateTimeFormat('it-IT', {day: '2-digit', month: 'short', year: 'numeric'}).format(new Date(value)); }
async function readResponse(response: Response) { const contentType = response.headers.get('content-type') || ''; if (contentType.includes('application/json')) return await response.json() as {error?: string; message?: {id: string; body: string; created_at: string}}; return {error: response.ok ? 'Risposta non valida dal server.' : 'Il servizio non è disponibile. Riprova tra qualche istante.'}; }
