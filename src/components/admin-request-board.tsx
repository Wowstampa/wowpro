'use client';

import {CheckCircle2, Clock3, MessageSquareText, Plus, Search, TriangleAlert, X} from 'lucide-react';
import {FormEvent, useState} from 'react';

import {FileList, type RequestFileItem} from '@/components/request-files';

export type AdminGraphicRequest = {
  id: string;
  publicId: string;
  companyName: string;
  requesterName: string;
  title: string;
  brief: string;
  type: 'revision' | 'modification' | 'creation';
  status: RequestStatus;
  creditCost: number;
  createdAt: string;
  files?: RequestFileItem[];
};

type RequestStatus = 'new' | 'in_progress' | 'completed' | 'rejected';

export type RequestClientOption = {recordId: string; companyName: string};
export type GraphicOperatorOption = {id: string; name: string};

const statusLabels: Record<RequestStatus, string> = {new: 'Nuova', in_progress: 'In lavorazione', completed: 'Completata', rejected: 'Rifiutata'};
const typeLabels: Record<AdminGraphicRequest['type'], string> = {revision: 'Revisione', modification: 'Modifica', creation: 'Creazione'};

export function AdminRequestBoard({clients, graphicOperators, initialRequests}: {clients: RequestClientOption[]; graphicOperators: GraphicOperatorOption[]; initialRequests: AdminGraphicRequest[]}) {
  const [requests, setRequests] = useState(initialRequests);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | RequestStatus>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase('it-IT');
  const visibleRequests = requests.filter((request) => {
    const matchesFilter = filter === 'all' || request.status === filter;
    const matchesQuery = !normalizedQuery || [request.publicId, request.companyName, request.requesterName, request.title, request.brief]
      .some((value) => value.toLocaleLowerCase('it-IT').includes(normalizedQuery));
    return matchesFilter && matchesQuery;
  });
  const counts = countStatuses(requests);

  async function updateStatus(requestId: string, status: RequestStatus) {
    setUpdatingId(requestId); setError('');
    try {
      const response = await fetch(`/api/admin/requests/${requestId}`, {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({status})});
      const result = await readApiResponse(response);
      if (!response.ok || !result.request) throw new Error(result.error || 'Aggiornamento non riuscito.');
      const updatedStatus = result.request.status;
      setRequests((current) => current.map((request) => request.id === requestId ? {...request, status: updatedStatus} : request));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Aggiornamento non riuscito.');
    } finally { setUpdatingId(null); }
  }

  return <>
    <section className="request-overview" aria-label="Riepilogo richieste">
      <RequestMetric icon={<MessageSquareText />} label="Aperte" note="nuove e in lavorazione" value={String(counts.new + counts.in_progress)} />
      <RequestMetric icon={<Clock3 />} label="Da assegnare" note="richieste appena ricevute" tone="blue" value={String(counts.new)} />
      <RequestMetric icon={<CheckCircle2 />} label="Completate" note="archivio operativo" tone="green" value={String(counts.completed)} />
      <RequestMetric icon={<TriangleAlert />} label="Rifiutate" note="non procedibili" tone="amber" value={String(counts.rejected)} />
    </section>

    <section className="request-toolbar">
      <div><span className="eyebrow">OPERATIVITÀ</span><h2>Richieste grafiche</h2><p>Gestisci le richieste e aggiorna lo stato di lavorazione.</p></div>
      <button className="button button--primary" onClick={() => setIsCreating(true)} type="button"><Plus size={17} />Nuova richiesta</button>
    </section>
    {error ? <p className="directory-error">{error}</p> : null}

    <section className="request-board" aria-label="Elenco richieste grafiche">
      <div className="request-board__filters">
        <label className="client-search"><Search size={17} /><input onChange={(event) => setQuery(event.target.value)} placeholder="Cerca richiesta o cliente..." value={query} /></label>
        <div className="credit-filter" role="group" aria-label="Filtra richieste">
          <button className={filter === 'all' ? 'is-selected' : ''} onClick={() => setFilter('all')} type="button">Tutte</button>
          <button className={filter === 'new' ? 'is-selected' : ''} onClick={() => setFilter('new')} type="button">Nuove</button>
          <button className={filter === 'in_progress' ? 'is-selected' : ''} onClick={() => setFilter('in_progress')} type="button">In corso</button>
          <button className={filter === 'completed' ? 'is-selected' : ''} onClick={() => setFilter('completed')} type="button">Completate</button>
        </div>
      </div>
      <div className="request-board__head"><span>Richiesta</span><span>Cliente</span><span>Brief</span><span>Crediti</span><span>Data</span><span>Stato</span></div>
      {visibleRequests.map((request) => <RequestRow isUpdating={updatingId === request.id} key={request.id} onStatusChange={(status) => updateStatus(request.id, status)} request={request} />)}
      {!visibleRequests.length ? <div className="request-board__empty"><MessageSquareText size={22} /><strong>Nessuna richiesta trovata</strong><p>{requests.length ? 'Modifica i filtri o la ricerca per vedere altre richieste.' : 'Le richieste inviate dai clienti compariranno qui.'}</p></div> : null}
    </section>
    {isCreating ? <CreateRequestModal clients={clients} graphicOperators={graphicOperators} onClose={() => setIsCreating(false)} onCreated={(request) => { setRequests((current) => [request, ...current]); setIsCreating(false); }} /> : null}
  </>;
}

function CreateRequestModal({clients, graphicOperators, onClose, onCreated}: {clients: RequestClientOption[]; graphicOperators: GraphicOperatorOption[]; onClose: () => void; onCreated: (request: AdminGraphicRequest) => void}) {
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function createRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true); setError('');
    const form = new FormData(event.currentTarget);
    const client = clients.find((item) => item.recordId === form.get('clientId'));
    if (!client) { setError('Seleziona un cliente.'); setIsSaving(false); return; }
    const payload = {
      airtableRecordId: client.recordId,
      companyName: client.companyName,
      title: String(form.get('title') || ''),
      brief: String(form.get('brief') || ''),
      type: String(form.get('type') || ''),
      creditCost: String(form.get('creditCost') || ''),
      assignedTo: String(form.get('assignedTo') || '') || null,
    };
    try {
      const response = await fetch('/api/admin/requests', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
      const result = await readApiResponse(response);
      if (!response.ok || !result.request || !isGraphicRequest(result.request)) throw new Error(result.error || 'Creazione non riuscita.');
      onCreated(result.request);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Creazione non riuscita.');
    } finally { setIsSaving(false); }
  }

  return <div aria-modal="true" className="modal-backdrop" role="dialog"><section className="client-modal"><header><div><h2>Nuova richiesta</h2><p>Inserimento manuale dello staff</p></div><button aria-label="Chiudi" className="modal-close" onClick={onClose} type="button"><X size={19} /></button></header>
    <form className="client-form" onSubmit={createRequest}>
      <label className="client-form__wide">Cliente<select defaultValue="" name="clientId" required><option disabled value="">Seleziona un cliente</option>{clients.map((client) => <option key={client.recordId} value={client.recordId}>{client.companyName}</option>)}</select></label>
      <label>Tipo richiesta<select defaultValue="modification" name="type"><option value="revision">Revisione</option><option value="modification">Modifica</option><option value="creation">Creazione</option></select></label>
      <label>Costo crediti<input min="1" name="creditCost" placeholder="es. 2000" required type="number" /></label>
      <label className="client-form__wide">Operatore grafico<select defaultValue="" name="assignedTo"><option value="">Da assegnare in seguito</option>{graphicOperators.map((operator) => <option key={operator.id} value={operator.id}>{operator.name}</option>)}</select></label>
      <label className="client-form__wide">Titolo<input name="title" placeholder="es. Aggiornamento listino A4" required /></label>
      <label className="client-form__wide">Brief<textarea name="brief" placeholder="Descrivi il lavoro richiesto, i materiali disponibili e le indicazioni importanti..." required rows={5} /></label>
      {error ? <p className="form-error">{error}</p> : null}
      <p className="form-hint">La richiesta verrà creata come nuova e tracciata nello storico interno.</p>
      <footer className="modal-actions"><button className="client-action" disabled={isSaving} onClick={onClose} type="button">Annulla</button><button className="client-action client-action--primary" disabled={isSaving} type="submit"><Plus size={16} />{isSaving ? 'Creazione...' : 'Crea richiesta'}</button></footer>
    </form>
  </section></div>;
}

function RequestRow({isUpdating, onStatusChange, request}: {isUpdating: boolean; onStatusChange: (status: RequestStatus) => void; request: AdminGraphicRequest}) {
  return <article className="request-board__row">
    <div><span className="admin-row__id">{request.publicId}</span><strong>{request.title}</strong><small>{typeLabels[request.type]}</small></div>
    <div><strong>{request.companyName}</strong><small>{request.requesterName}</small></div>
    <div className="request-board__brief"><p title={request.brief}>{request.brief}</p><FileList compact files={request.files || []} /></div>
    <strong className="request-cost">{formatNumber(request.creditCost)}</strong>
    <span className="request-date">{formatDate(request.createdAt)}</span>
    <select aria-label={`Aggiorna stato ${request.publicId}`} disabled={isUpdating} onChange={(event) => onStatusChange(event.target.value as RequestStatus)} value={request.status}>
      {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>
  </article>;
}

function RequestMetric({icon, label, note, tone = 'green', value}: {icon: React.ReactNode; label: string; note: string; tone?: string; value: string}) {
  return <article className="credit-overview__metric"><span className={`metric-icon metric-icon--${tone}`}>{icon}</span><p>{label}</p><strong>{value}</strong><small>{note}</small></article>;
}

function countStatuses(requests: AdminGraphicRequest[]) { return requests.reduce<Record<RequestStatus, number>>((counts, request) => ({...counts, [request.status]: counts[request.status] + 1}), {new: 0, in_progress: 0, completed: 0, rejected: 0}); }
function formatDate(value: string) { return new Intl.DateTimeFormat('it-IT', {day: '2-digit', month: 'short', year: 'numeric'}).format(new Date(value)); }
function formatNumber(value: number) { return new Intl.NumberFormat('it-IT').format(value); }

async function readApiResponse(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return await response.json() as {error?: string; request?: {status: RequestStatus}};
  return {error: response.ok ? 'Risposta non valida dal server.' : 'Il servizio non è disponibile. Riprova tra qualche istante.'};
}

function isGraphicRequest(value: unknown): value is AdminGraphicRequest {
  return value !== null && typeof value === 'object' && 'id' in value && 'publicId' in value;
}
