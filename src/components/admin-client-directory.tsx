'use client';

import {FormEvent, useState} from 'react';
import {Archive, Check, Coins, Pencil, RotateCcw, Search, UserRoundPlus, X} from 'lucide-react';

export type AdminClient = {
  recordId: string;
  clientId: string;
  companyName: string;
  email: string;
  plan: string;
  subscriptionStatus: string;
  accountManager: string;
  accountManagerId: string;
  designerId: string;
  shopifyCustomerId: string;
  includedCredits: number;
  extraCredits: number;
  renewalDate: string;
  isArchived: boolean;
};

export type TeamMemberOption = {id: string; name: string};

export function AdminClientDirectory({archived, designers = [], initialClients, teamMembers = []}: {archived: boolean; designers?: TeamMemberOption[]; initialClients: AdminClient[]; teamMembers?: TeamMemberOption[]}) {
  const [clients, setClients] = useState(initialClients);
  const [query, setQuery] = useState('');
  const [editingClient, setEditingClient] = useState<AdminClient | null>(null);
  const [creditClient, setCreditClient] = useState<AdminClient | null>(null);
  const [archivingClient, setArchivingClient] = useState<AdminClient | null>(null);
  const [restoringClientId, setRestoringClientId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [notice, setNotice] = useState('');

  const visibleClients = clients.filter((client) => {
    const searchTerm = query.trim().toLocaleLowerCase('it-IT');
    return client.isArchived === archived && (!searchTerm || [client.companyName, client.email, client.clientId, client.accountManager]
      .some((value) => value.toLocaleLowerCase('it-IT').includes(searchTerm)));
  });

  function replaceClient(recordId: string, patch: Partial<AdminClient>) {
    setClients((current) => current.map((client) => client.recordId === recordId ? {...client, ...patch} : client));
  }

  async function restoreClient(client: AdminClient) {
    setRestoringClientId(client.recordId);
    setActionError('');
    try {
      const response = await fetch(`/api/admin/clients/${client.recordId}/restore`, {method: 'POST'});
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.error || 'Ripristino non riuscito.');
      replaceClient(client.recordId, {isArchived: false});
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Ripristino non riuscito.');
    } finally {
      setRestoringClientId(null);
    }
  }

  return (
    <>
      <section className="client-toolbar">
        <div><span className="eyebrow">{archived ? 'ARCHIVIO CLIENTI' : 'ANAGRAFICA CLIENTI'}</span><h2>{archived ? 'Clienti rimossi dalla gestione operativa' : 'Stato abbonamento, saldi crediti e account manager'}</h2></div>
        <div className="client-toolbar__actions"><label className="client-search"><Search size={17} /><input onChange={(event) => setQuery(event.target.value)} placeholder="Cerca cliente o azienda..." value={query} /></label>{archived ? null : <button className="button button--primary" onClick={() => { setNotice(''); setIsCreating(true); }} type="button"><UserRoundPlus size={17} />Nuovo cliente</button>}</div>
      </section>
      {actionError ? <p className="directory-error">{actionError}</p> : null}
      {notice ? <p className="directory-notice">{notice}</p> : null}

      <section className="client-list" aria-label="Elenco clienti WOWPRO">
        <div className="client-list__head"><span>Cliente</span><span>Abbonamento</span><span>Crediti inclusi</span><span>Extra</span><span>Account manager</span><span>Azioni</span></div>
        {visibleClients.map((client) => <ClientRow archived={archived} client={client} isRestoring={restoringClientId === client.recordId} key={client.recordId} onArchive={() => setArchivingClient(client)} onCredits={() => setCreditClient(client)} onEdit={() => setEditingClient(client)} onRestore={() => restoreClient(client)} />)}
        {!visibleClients.length ? <p className="client-list__empty">Nessun cliente corrisponde alla ricerca.</p> : null}
      </section>

      {isCreating ? <CreateClientModal designers={designers} teamMembers={teamMembers} onClose={() => setIsCreating(false)} onCreated={(client, warning) => { setClients((current) => [client, ...current]); setIsCreating(false); setNotice(warning || `${client.companyName} è stato aggiunto ai clienti.`); }} /> : null}
      {editingClient ? <EditClientModal designers={designers} teamMembers={teamMembers} client={editingClient} onClose={() => setEditingClient(null)} onSaved={(patch) => { replaceClient(editingClient.recordId, patch); setEditingClient(null); }} /> : null}
      {creditClient ? <CreditModal client={creditClient} onClose={() => setCreditClient(null)} onSaved={(patch) => { replaceClient(creditClient.recordId, patch); setCreditClient(null); }} /> : null}
      {archivingClient ? <ArchiveClientModal client={archivingClient} onArchived={() => { replaceClient(archivingClient.recordId, {isArchived: true}); setArchivingClient(null); }} onClose={() => setArchivingClient(null)} /> : null}
    </>
  );
}

function ClientRow({archived, client, isRestoring, onArchive, onEdit, onCredits, onRestore}: {archived: boolean; client: AdminClient; isRestoring: boolean; onArchive: () => void; onEdit: () => void; onCredits: () => void; onRestore: () => void}) {
  const totalCredits = client.includedCredits + client.extraCredits;
  return (
    <article className="client-table-row">
      <div><span className="client-row__id">{client.clientId}</span><h3>{client.companyName}</h3><p>{client.email}</p></div>
      <div><span className={`subscription-pill subscription-pill--${statusTone(client.subscriptionStatus)}`}>{client.subscriptionStatus || 'Non impostato'}</span><small>{client.plan || 'Piano non assegnato'}</small></div>
      <CreditBalance current={client.includedCredits} label="inclusi" />
      <div><strong className="extra-credit">{formatNumber(client.extraCredits)}</strong><small>crediti extra</small></div>
      <div><strong>{client.accountManager || 'Non assegnato'}</strong><small>{client.shopifyCustomerId ? 'Shopify collegato' : 'Shopify non collegato'}</small></div>
      <div className="client-actions">{archived ? <button className="client-action" disabled={isRestoring} onClick={onRestore} type="button"><RotateCcw size={15} />{isRestoring ? 'Ripristino...' : 'Ripristina'}</button> : <><button className="client-action" onClick={onEdit} type="button"><Pencil size={15} />Modifica</button><button className="client-action client-action--primary" onClick={onCredits} type="button"><Coins size={16} />Crediti</button><button aria-label={`Archivia ${client.companyName}`} className="client-action client-action--archive" onClick={onArchive} type="button"><Archive size={15} /></button></>}</div>
      <span className="sr-only">Saldo totale: {formatNumber(totalCredits)} crediti</span>
    </article>
  );
}

function CreditBalance({current, label}: {current: number; label: string}) {
  const ratio = Math.min(current / 12_000, 1) * 100;
  return <div><strong>{formatNumber(current)}</strong><small>{label}</small><span className="credit-meter"><i style={{width: `${ratio}%`}} /></span></div>;
}

function CreateClientModal({designers, onClose, onCreated, teamMembers}: {designers: TeamMemberOption[]; onClose: () => void; onCreated: (client: AdminClient, warning?: string) => void; teamMembers: TeamMemberOption[]}) {
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true); setError('');
    const form = new FormData(event.currentTarget);
    const payload = {
      ragione_sociale: String(form.get('companyName') || ''),
      email_login: String(form.get('email') || ''),
      piano: String(form.get('plan') || ''),
      stato_abbonamento: String(form.get('status') || ''),
      account_manager_id: String(form.get('managerId') || ''),
      account_manager_nome: teamMembers.find((member) => member.id === form.get('managerId'))?.name || '',
      designer_id: String(form.get('designerId') || ''),
      shopify_customer_id: String(form.get('shopifyCustomerId') || ''),
      crediti_inclusi_mese: String(form.get('monthlyCredits') || '0'),
      invia_invito: form.get('sendInvite') === 'on',
    };
    try {
      const response = await fetch('/api/admin/clients', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
      const result = await readApiResponse(response);
      if (!response.ok || !result.fields || !result.recordId) throw new Error(result.error || 'Creazione non riuscita.');
      const fields = result.fields;
      onCreated({
        recordId: result.recordId,
        clientId: fields.cliente_id || 'NUOVO',
        companyName: fields.ragione_sociale || payload.ragione_sociale,
        email: fields.email_login || payload.email_login,
        plan: fields.piano || payload.piano,
        subscriptionStatus: fields.stato_abbonamento || payload.stato_abbonamento,
        accountManager: fields.account_manager_nome || '',
        accountManagerId: payload.account_manager_id,
        designerId: payload.designer_id,
        shopifyCustomerId: fields.shopify_customer_id || '',
        includedCredits: Number(fields.crediti_inclusi_residui || 0),
        extraCredits: Number(fields.crediti_extra_residui || 0),
        renewalDate: '',
        isArchived: false,
      }, result.warning);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Creazione non riuscita.');
    } finally { setIsSaving(false); }
  }

  return <Modal onClose={onClose} subtitle="Il cliente verrà aggiunto all’anagrafica WOWPRO." title="Nuovo cliente">
    <form className="client-form" onSubmit={save}>
      <label>Azienda<input name="companyName" placeholder="Ragione sociale" required /></label>
      <label>Email di accesso<input name="email" placeholder="nome@azienda.it" required type="email" /></label>
      <label>Piano<select defaultValue="Premium" name="plan"><option>Basic</option><option>Standard</option><option>Premium</option></select></label>
      <label>Stato abbonamento<select defaultValue="Attivo" name="status"><option>Attivo</option><option>Sospeso</option><option>Disdetto</option></select></label>
      <label>Crediti inclusi al mese<input defaultValue="0" min="0" name="monthlyCredits" type="number" /></label>
      <label>Account manager<ManagerSelect defaultValue="" teamMembers={teamMembers} /></label>
      <label>Grafico dedicato<DesignerSelect defaultValue="" designers={designers} /></label>
      <label className="client-form__wide">Shopify Customer ID<input name="shopifyCustomerId" placeholder="Facoltativo" /></label>
      <label className="client-form__check"><input defaultChecked name="sendInvite" type="checkbox" />Invia al cliente l’email di accesso al portale</label>
      {error ? <p className="form-error">{error}</p> : null}
      <ModalActions isSubmitting={isSaving} submitLabel="Crea cliente" onClose={onClose} />
    </form>
  </Modal>;
}

function EditClientModal({client, designers, onClose, onSaved, teamMembers}: {client: AdminClient; designers: TeamMemberOption[]; onClose: () => void; onSaved: (patch: Partial<AdminClient>) => void; teamMembers: TeamMemberOption[]}) {
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true); setError('');
    const form = new FormData(event.currentTarget);
    const payload = {
      ragione_sociale: String(form.get('companyName') || ''),
      email_login: String(form.get('email') || ''),
      piano: String(form.get('plan') || ''),
      stato_abbonamento: String(form.get('status') || ''),
      account_manager_id: String(form.get('managerId') || ''),
      account_manager_nome: teamMembers.find((member) => member.id === form.get('managerId'))?.name || '',
      designer_id: String(form.get('designerId') || ''),
      shopify_customer_id: String(form.get('shopifyCustomerId') || ''),
    };
    try {
      const response = await fetch(`/api/admin/clients/${client.recordId}`, {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
      const result = await readApiResponse(response);
      if (!response.ok || !result.fields) throw new Error(result.error || 'Salvataggio non riuscito.');
      onSaved({companyName: result.fields.ragione_sociale || '', email: result.fields.email_login || '', plan: result.fields.piano || '', subscriptionStatus: result.fields.stato_abbonamento || '', accountManager: result.fields.account_manager_nome || '', accountManagerId: payload.account_manager_id, designerId: payload.designer_id, shopifyCustomerId: result.fields.shopify_customer_id || ''});
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Salvataggio non riuscito.');
    } finally { setIsSaving(false); }
  }

  return <Modal onClose={onClose} subtitle={client.clientId} title="Modifica cliente">
    <form className="client-form" onSubmit={save}>
      <label>Azienda<input defaultValue={client.companyName} name="companyName" required /></label>
      <label>Email di accesso<input defaultValue={client.email} name="email" required type="email" /></label>
      <label>Piano<select defaultValue={client.plan} name="plan"><option>Basic</option><option>Standard</option><option>Premium</option></select></label>
      <label>Stato abbonamento<select defaultValue={client.subscriptionStatus} name="status"><option>Attivo</option><option>Sospeso</option><option>Disdetto</option></select></label>
      <label>Account manager<ManagerSelect defaultValue={client.accountManagerId} fallbackName={client.accountManager} teamMembers={teamMembers} /></label>
      <label>Grafico dedicato<DesignerSelect defaultValue={client.designerId} designers={designers} /></label>
      <label>Shopify Customer ID<input defaultValue={client.shopifyCustomerId} name="shopifyCustomerId" /></label>
      {error ? <p className="form-error">{error}</p> : null}
      <ModalActions isSubmitting={isSaving} submitLabel="Salva modifiche" onClose={onClose} />
    </form>
  </Modal>;
}

function CreditModal({client, onClose, onSaved}: {client: AdminClient; onClose: () => void; onSaved: (patch: Partial<AdminClient>) => void}) {
  const [bucket, setBucket] = useState<'extra' | 'included'>('extra');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true); setError('');
    const form = new FormData(event.currentTarget);
    const payload = {bucket, amount: String(form.get('amount') || ''), reason: String(form.get('reason') || '')};
    try {
      const response = await fetch(`/api/admin/clients/${client.recordId}/credits`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
      const result = await readApiResponse(response);
      if (!response.ok || !result.fields) throw new Error(result.error || 'Accredito non riuscito.');
      onSaved({includedCredits: Number(result.fields.crediti_inclusi_residui || 0), extraCredits: Number(result.fields.crediti_extra_residui || 0)});
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Accredito non riuscito.');
    } finally { setIsSaving(false); }
  }

  return <Modal onClose={onClose} subtitle={`${client.companyName} · ${client.clientId}`} title="Accredita crediti">
    <form className="client-form" onSubmit={save}>
      <fieldset className="credit-choice"><legend>Tipo di credito</legend><button className={bucket === 'extra' ? 'is-selected' : ''} onClick={() => setBucket('extra')} type="button">Extra (non scadono)</button><button className={bucket === 'included' ? 'is-selected' : ''} onClick={() => setBucket('included')} type="button">Inclusi (mensili)</button></fieldset>
      <label>Quantità<input min="1" name="amount" placeholder="es. 2000" required type="number" /></label>
      <label className="client-form__wide">Motivazione<textarea name="reason" placeholder="Motivo dell'accredito..." required rows={4} /></label>
      {error ? <p className="form-error">{error}</p> : null}
      <p className="form-hint">Il movimento verrà registrato nel log crediti.</p>
      <ModalActions isSubmitting={isSaving} submitLabel="Accredita" onClose={onClose} />
    </form>
  </Modal>;
}

function ArchiveClientModal({client, onArchived, onClose}: {client: AdminClient; onArchived: () => void; onClose: () => void}) {
  const [confirmationName, setConfirmationName] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const isConfirmed = confirmationName.trim() === client.companyName;

  async function archive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isConfirmed) return;
    setIsSaving(true); setError('');
    try {
      const response = await fetch(`/api/admin/clients/${client.recordId}/archive`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({confirmationName: confirmationName.trim()})});
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.error || 'Archiviazione non riuscita.');
      onArchived();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Archiviazione non riuscita.');
    } finally { setIsSaving(false); }
  }

  return <Modal onClose={onClose} subtitle="Questa operazione rimuove il cliente dalla gestione operativa." title="Archivia cliente">
    <form className="client-form" onSubmit={archive}>
      <p className="archive-warning">Per confermare, scrivi esattamente <strong>{client.companyName}</strong>. I dati e i movimenti resteranno conservati.</p>
      <label className="client-form__wide">Nome azienda<input autoComplete="off" onChange={(event) => setConfirmationName(event.target.value)} placeholder={client.companyName} value={confirmationName} /></label>
      {error ? <p className="form-error">{error}</p> : null}
      <footer className="modal-actions"><button className="client-action" disabled={isSaving} onClick={onClose} type="button">Annulla</button><button className="client-action client-action--archive-confirm" disabled={!isConfirmed || isSaving} type="submit"><Archive size={16} />{isSaving ? 'Archiviazione...' : 'Archivia cliente'}</button></footer>
    </form>
  </Modal>;
}

function DesignerSelect({defaultValue, designers}: {defaultValue: string; designers: TeamMemberOption[]}) {
  return <select defaultValue={defaultValue} name="designerId"><option value="">Non assegnato</option>{designers.map((designer) => <option key={designer.id} value={designer.id}>{designer.name}</option>)}</select>;
}

function ManagerSelect({defaultValue, fallbackName, teamMembers}: {defaultValue: string; fallbackName?: string; teamMembers: TeamMemberOption[]}) {
  const unknownName = !defaultValue && fallbackName ? fallbackName : '';
  return <select defaultValue={defaultValue} name="managerId"><option value="">{unknownName ? `${unknownName} (non collegato)` : 'Non assegnato'}</option>{teamMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select>;
}

function Modal({children, onClose, subtitle, title}: {children: React.ReactNode; onClose: () => void; subtitle: string; title: string}) {
  return <div aria-modal="true" className="modal-backdrop" role="dialog"><section className="client-modal"><header><div><h2>{title}</h2><p>{subtitle}</p></div><button aria-label="Chiudi" className="modal-close" onClick={onClose} type="button"><X size={19} /></button></header>{children}</section></div>;
}

function ModalActions({isSubmitting, onClose, submitLabel}: {isSubmitting: boolean; onClose: () => void; submitLabel: string}) {
  return <footer className="modal-actions"><button className="client-action" disabled={isSubmitting} onClick={onClose} type="button">Annulla</button><button className="client-action client-action--primary" disabled={isSubmitting} type="submit"><Check size={16} />{isSubmitting ? 'Salvataggio...' : submitLabel}</button></footer>;
}

function statusTone(status: string) {
  const value = status.toLocaleLowerCase('it-IT');
  if (value === 'attivo') return 'active';
  if (value === 'sospeso') return 'paused';
  return 'cancelled';
}

async function readApiResponse(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return await response.json() as ClientMutationResponse;
  return {error: response.ok ? 'Risposta non valida dal server.' : 'Il servizio non è disponibile. Riprova tra qualche istante.'};
}

type ClientMutationResponse = {
  error?: string;
  warning?: string;
  recordId?: string;
  fields?: {
    cliente_id?: string;
    ragione_sociale?: string;
    email_login?: string;
    piano?: string;
    stato_abbonamento?: string;
    account_manager_nome?: string;
    shopify_customer_id?: string;
    crediti_inclusi_residui?: number;
    crediti_extra_residui?: number;
  };
};

function formatNumber(value: number) { return new Intl.NumberFormat('it-IT').format(value); }
