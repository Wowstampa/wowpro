'use client';

import {Check, MessageSquareText, Plus, Upload, X} from 'lucide-react';
import {ChangeEvent, DragEvent, FormEvent, useCallback, useState} from 'react';
import {useRouter} from 'next/navigation';

import {ACCEPTED_FILES, ACCEPTED_LABEL, type RequestFileItem, uploadRequestFiles, validateFiles} from '@/components/request-files';
import {RequestDrawer, RequestThread, useRequestFromUrl} from '@/components/request-thread';

export type ClientWorkspaceRequest = {
  id: string;
  publicId: string;
  title: string;
  brief: string;
  status: string;
  type: string;
  creditCost: number;
  createdAt: string;
  messages: Array<{id: string; body: string; createdAt: string}>;
  files: RequestFileItem[];
};

export function ClientRequestsWorkspace({extraCredits, includedCredits, requests}: {extraCredits: number; includedCredits: number; requests: ClientWorkspaceRequest[]}) {
  const router = useRouter();
  const [items, setItems] = useState(requests);
  const [balances, setBalances] = useState({included: includedCredits, extra: extraCredits});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [notice, setNotice] = useState('');
  // Mobile-only status filter: the pills are hidden on desktop, where the filter always stays on "all".
  const [filter, setFilter] = useState<keyof typeof FILTERS>('all');
  const visible = filter === 'all' ? items : items.filter((item) => FILTERS[filter].statuses.includes(item.status));
  const closeDrawer = useCallback(() => { setSelectedId(null); if (window.location.search.includes('r=')) window.history.replaceState(null, '', window.location.pathname); }, []);
  useRequestFromUrl(useCallback((id: string) => setSelectedId(id), []));

  return <section className="client-requests-workspace">
    <header className="client-requests-toolbar">
      <div>
        <h2>Le tue richieste grafiche</h2>
        <p>Segui lo stato di ogni lavorazione in tempo reale</p>
      </div>
      <button className="button button--primary" onClick={() => setIsCreating(true)} type="button">
        <Plus size={17} /> Nuova richiesta
      </button>
    </header>
    {items.length ? <div aria-label="Filtra richieste" className="mobile-filters" role="tablist">{(Object.keys(FILTERS) as Array<keyof typeof FILTERS>).map((key) => { const count = key === 'all' ? items.length : items.filter((item) => FILTERS[key].statuses.includes(item.status)).length; return <button aria-selected={filter === key} className={filter === key ? 'is-active' : ''} key={key} onClick={() => setFilter(key)} role="tab" type="button">{FILTERS[key].label}{count ? <small>{count}</small> : null}</button>; })}</div> : null}
    {notice ? <p className="form-error request-notice">{notice}</p> : null}
    {!items.length ? <section className="empty-card empty-card--section"><span className="eyebrow">NESSUNA RICHIESTA</span><h2>Non hai richieste attive</h2><p>Inizia con una nuova richiesta per coinvolgere il tuo team grafico.</p></section> : <div className="client-requests-grid client-requests-grid--single">
      <div className="client-request-list client-request-list--workspace">
        {visible.map((request) => <button aria-pressed={selectedId === request.id} className={'client-request-row' + (selectedId === request.id ? ' client-request-row--selected' : '')} key={request.id} onClick={() => setSelectedId(request.id)} type="button">
          <span className="client-request-row__icon"><MessageSquareText size={17} /></span>
          <span className="client-request-row__copy">
            <small>{request.publicId}</small>
            <strong>{request.title}</strong>
            <em>{requestType(request.type)} <i /> {number(request.creditCost)} crediti</em>
          </span>
          <span className="client-request-row__meta"><b className={'client-request-status client-request-status--' + statusClass(request.status)}>{status(request.status)}</b><small>{shortDate(request.createdAt)}</small></span>
        </button>)}
        {!visible.length ? <p className="mobile-filters__empty">Nessuna richiesta in questa sezione.</p> : null}
      </div>
    </div>}
    <button aria-label="Nuova richiesta" className="fab" onClick={() => setIsCreating(true)} type="button"><Plus size={20} /> Nuova richiesta</button>
    {selectedId ? <RequestDrawer onClose={closeDrawer}><RequestThread onStatusChange={(value) => setItems((current) => current.map((item) => item.id === selectedId ? {...item, status: value} : item))} requestId={selectedId} viewer="client" /></RequestDrawer> : null}
    {isCreating ? <CreateRequestModal extraCredits={balances.extra} includedCredits={balances.included} onClose={() => setIsCreating(false)} onCreated={(request, warning) => { setNotice(warning || ''); const usedIncluded = Math.min(balances.included, request.creditCost); setBalances({included: balances.included - usedIncluded, extra: balances.extra - (request.creditCost - usedIncluded)}); setItems((current) => [request, ...current]); setSelectedId(request.id); setIsCreating(false); router.refresh(); }} /> : null}
  </section>;
}

function CreateRequestModal({extraCredits, includedCredits, onClose, onCreated}: {extraCredits: number; includedCredits: number; onClose: () => void; onCreated: (request: ClientWorkspaceRequest, warning?: string) => void}) {
  const [type, setType] = useState<'revision' | 'modification' | 'creation'>('modification');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const creditCost = {revision: 1_000, modification: 2_000, creation: 3_000}[type];
  const available = includedCredits + extraCredits;
  const after = available - creditCost;

  async function createRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const brief = String(form.get('brief') || '').trim();
    if (brief.length < 10) { setError(`La descrizione deve contenere almeno 10 caratteri: ne mancano ${10 - brief.length}.`); return; }
    setError(''); setIsSaving(true);
    try {
      const response = await fetch('/api/client/requests', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({type, brief})});
      const result = await readResponse(response);
      if (!response.ok || !result.request) throw new Error(result.error || 'Creazione non riuscita.');
      let uploaded: RequestFileItem[] = [];
      let warning = '';
      if (files.length) {
        setProgress(0);
        const outcome = await uploadRequestFiles(result.request.id, files, setProgress);
        uploaded = outcome.uploaded;
        if (outcome.failed.length) warning = `Richiesta inviata, ma questi file non sono stati caricati: ${outcome.failed.join(', ')}. Puoi aggiungerli dal dettaglio della richiesta.`;
      }
      onCreated({...result.request, messages: [], files: uploaded}, warning);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Creazione non riuscita.'); } finally { setIsSaving(false); setProgress(null); }
  }

  function addFiles(selected: File[]) {
    if (!selected.length) return;
    const invalid = validateFiles(selected);
    if (invalid) { setError(invalid); return; }
    setError(''); setFiles((current) => [...current, ...selected.filter((file) => !current.some((item) => item.name === file.name && item.size === file.size))]);
  }

  function selectFiles(event: ChangeEvent<HTMLInputElement>) { addFiles(Array.from(event.target.files || [])); event.target.value = ''; }
  function dropFiles(event: DragEvent<HTMLElement>) { event.preventDefault(); addFiles(Array.from(event.dataTransfer.files || [])); }

  return <div aria-modal="true" className="modal-backdrop" role="dialog"><section aria-labelledby="clientRequestTitle" className="client-request-modal"><header className="client-request-modal__head"><div><h2 id="clientRequestTitle">Nuova richiesta grafica</h2><p>Scegli il servizio, descrivi cosa ti serve e carica i file.</p></div><button aria-label="Chiudi" className="modal-close" onClick={onClose} type="button"><X size={19} /></button></header>
    <form onSubmit={createRequest}>
      <div className="client-request-modal__body">
        <fieldset className="service-picker"><legend>Tipo di servizio <b>*</b></legend>{(['revision', 'modification', 'creation'] as const).map((item) => <button aria-pressed={type === item} className={type === item ? 'is-selected' : ''} key={item} onClick={() => setType(item)} type="button"><span className="service-picker__check">{type === item ? <Check size={14} /> : null}</span><span>{requestType(item)}</span><small><b>{number({revision: 1_000, modification: 2_000, creation: 3_000}[item])}</b> crediti</small></button>)}</fieldset>
        <label className="request-modal-field"><span>Descrizione della richiesta <b>*</b></span><textarea minLength={10} name="brief" placeholder="Es. Modificare il volantino A5 cambiando data e logo, mantenendo lo stesso stile..." required rows={5} /></label>
        <label className="request-modal-field" onDragOver={(event) => event.preventDefault()} onDrop={dropFiles}>File di riferimento<input accept={ACCEPTED_FILES} multiple onChange={selectFiles} type="file" /><span className="request-file-drop"><i><Upload size={19} /></i><strong>Trascina i file qui o <b>sfoglia</b></strong><small>{ACCEPTED_LABEL}</small></span></label>
        {files.length ? <div className="request-file-list">{files.map((file) => <span key={`${file.name}-${file.lastModified}`}>{file.name}{isSaving ? null : <button aria-label={`Rimuovi ${file.name}`} onClick={() => setFiles((current) => current.filter((item) => item !== file))} type="button"><X size={12} /></button>}</span>)}</div> : null}
        {progress !== null ? <div className="upload-status"><span>Caricamento file {Math.round(progress * 100)}%</span><span className="upload-progress"><i style={{width: `${Math.round(progress * 100)}%`}} /></span></div> : null}
        <section className="request-credit-check"><h3>Verifica crediti in tempo reale</h3><div><span>Costo del servizio</span><b>−{number(creditCost)}</b></div><div><span>Disponibili ora <small>({number(includedCredits)} inclusi + {number(extraCredits)} extra)</small></span><b>{number(available)}</b></div><div className="request-credit-check__total"><span>Saldo dopo la richiesta</span><b className={after < 0 ? 'negative' : ''}>{number(Math.max(after, 0))}</b></div><p><Check size={15} /> {after >= 0 ? 'Crediti sufficienti per inviare la richiesta.' : 'Crediti insufficienti per questo servizio.'}</p></section>
        {error ? <p className="form-error">{error}</p> : null}
      </div>
      <footer className="client-request-modal__foot"><small>I crediti inclusi vengono usati per primi, poi gli extra.</small><span /><button className="client-action" disabled={isSaving} onClick={onClose} type="button">Annulla</button><button className="client-action client-action--primary" disabled={isSaving || after < 0} type="submit"><Check size={16} />{progress !== null ? 'Caricamento file...' : isSaving ? 'Invio...' : 'Invia richiesta'}</button></footer>
    </form>
  </section></div>;
}

const FILTERS = {
  all: {label: 'Tutte', statuses: ['new', 'in_progress', 'review', 'completed', 'rejected']},
  open: {label: 'In corso', statuses: ['new', 'in_progress']},
  review: {label: 'Da approvare', statuses: ['review']},
  closed: {label: 'Chiuse', statuses: ['completed', 'rejected']},
};

function status(value: string) { return ({new: 'Nuova', in_progress: 'In lavorazione', review: 'Bozza da approvare', completed: 'Completata', rejected: 'Rifiutata'} as Record<string, string>)[value] || 'Aggiornata'; }
function statusClass(value: string) { return value === 'in_progress' ? 'working' : value === 'review' ? 'review' : value === 'completed' ? 'completed' : value === 'rejected' ? 'rejected' : 'new'; }
function requestType(value: string) { return ({revision: 'Revisione', modification: 'Modifica', creation: 'Creazione'} as Record<string, string>)[value] || value || 'Richiesta'; }
function number(value: number) { return new Intl.NumberFormat('it-IT').format(value); }
function shortDate(value: string) { return new Intl.DateTimeFormat('it-IT', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}).format(new Date(value)); }

async function readResponse(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return await response.json() as {error?: string; request?: Omit<ClientWorkspaceRequest, 'messages'>};
  return {error: response.ok ? 'Risposta non valida dal servizio.' : 'Il servizio non è disponibile. Riprova tra qualche istante.'};
}
