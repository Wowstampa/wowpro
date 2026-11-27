'use client';

import {Check, Mail, Pencil, RefreshCw, Search, ShieldCheck, UserRoundPlus, X} from 'lucide-react';
import {FormEvent, useState} from 'react';

import {Avatar} from '@/components/avatar';

export type TeamOperator = {id: string; email: string; fullName: string; role: TeamRole; status: TeamStatus; createdAt: string; phone?: string | null};
type TeamRole = 'admin' | 'staff' | 'graphic_operator';
type TeamStatus = 'active' | 'suspended' | 'revoked';
const roleLabels: Record<TeamRole, string> = {admin: 'Amministrazione', staff: 'Account Manager', graphic_operator: 'Grafico'};
const statusLabels: Record<TeamStatus, string> = {active: 'Attivo', suspended: 'Sospeso', revoked: 'Revocato'};

export function AdminTeamDirectory({initialOperators}: {initialOperators: TeamOperator[]}) {
  const [operators, setOperators] = useState(initialOperators);
  const [query, setQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [editingOperator, setEditingOperator] = useState<TeamOperator | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sync, setSync] = useState<{state: 'idle' | 'running'; report: SyncReport | null}>({state: 'idle', report: null});
  const [inviting, setInviting] = useState<string | null>(null);
  async function runSync(invite?: string) {
    setError(''); setNotice(''); setSync((current) => ({...current, state: 'running'})); if (invite) setInviting(invite);
    try {
      const response = await fetch('/api/admin/access-sync', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(invite ? {invite} : {})});
      const result = await response.json().catch(() => ({})) as {error?: string; report?: SyncReport};
      if (!response.ok || !result.report) throw new Error(result.error || 'Sincronizzazione non riuscita.');
      setSync({state: 'idle', report: result.report});
      if (invite) setNotice(`Invito inviato a ${invite}.`);
      if (result.report.changed.length || invite) window.setTimeout(() => window.location.reload(), 1500);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Sincronizzazione non riuscita.'); setSync((current) => ({...current, state: 'idle'})); }
    finally { setInviting(null); }
  }
  const visibleOperators = operators.filter((operator) => !query.trim() || [operator.fullName, operator.email, roleLabels[operator.role]].some((value) => value.toLocaleLowerCase('it-IT').includes(query.trim().toLocaleLowerCase('it-IT'))));
  return <><section className="team-toolbar"><div><span className="eyebrow">AMMINISTRAZIONE</span><h2>Team & ruoli</h2><p>Gestisci gli accessi del team interno: Amministrazione, Account Manager e Grafico.</p></div><div className="team-toolbar__actions"><button className="button" disabled={sync.state === 'running'} onClick={() => runSync()} type="button"><RefreshCw className={sync.state === 'running' ? 'spin' : ''} size={16} />{sync.state === 'running' ? 'Sincronizzo…' : 'Sincronizza con Airtable'}</button><button className="button button--primary" onClick={() => setIsCreating(true)} type="button"><UserRoundPlus size={17} />Nuovo operatore</button></div></section>{error ? <p className="directory-error">{error}</p> : null}{notice ? <p className="directory-notice">{notice}</p> : null}
    <p className="team-sync-hint">Ruoli e accessi seguono Airtable: chi è in <b>Utenti</b> (stato Attivo) entra come team, chi è in <b>Clienti</b> come cliente. Le modifiche fatte a mano in Airtable arrivano qui entro 15 minuti, o subito al login della persona.</p>
    {sync.report ? <SyncPanel inviting={inviting} onInvite={(email) => runSync(email)} report={sync.report} /> : null}
    <section className="team-directory"><div className="team-directory__filters"><label className="client-search"><Search size={17} /><input onChange={(event) => setQuery(event.target.value)} placeholder="Cerca operatore o email..." value={query} /></label></div><div className="team-directory__head"><span>Operatore</span><span>Email</span><span>Ruolo</span><span>Stato</span><span>Azioni</span></div>{visibleOperators.map((operator) => <article className="team-directory__row" key={operator.id}><strong>{operator.fullName}</strong><span>{operator.email}</span><span className={`team-role team-role--${operator.role}`}>{roleLabels[operator.role]}</span><span className={`team-status team-status--${operator.status}`}>{statusLabels[operator.status]}</span><button className="client-action" onClick={() => setEditingOperator(operator)} type="button"><Pencil size={15} />Modifica</button></article>)}{!visibleOperators.length ? <p className="client-list__empty">Nessun operatore corrisponde alla ricerca.</p> : null}</section>
    {isCreating ? <OperatorModal mode="create" onClose={() => setIsCreating(false)} onError={setError} onSaved={(operator, warning) => { setOperators((current) => [operator, ...current]); setIsCreating(false); if (warning) setNotice(warning); }} /> : null}
    {editingOperator ? <OperatorModal mode="edit" operator={editingOperator} onClose={() => setEditingOperator(null)} onError={setError} onSaved={(operator, warning) => { setOperators((current) => current.map((item) => item.id === operator.id ? operator : item)); setEditingOperator(null); if (warning) setNotice(warning); }} /> : null}
  </>;
}

function OperatorModal({mode, onClose, onError, onSaved, operator}: {mode: 'create' | 'edit'; onClose: () => void; onError: (error: string) => void; onSaved: (operator: TeamOperator, warning?: string) => void; operator?: TeamOperator}) {
  const [error, setError] = useState(''); const [isSaving, setIsSaving] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(''); onError(''); setIsSaving(true); const form = new FormData(event.currentTarget); const payload = {fullName: String(form.get('fullName') || ''), email: String(form.get('email') || ''), role: String(form.get('role') || ''), status: String(form.get('status') || ''), phone: String(form.get('phone') || '')}; try { const response = await fetch(mode === 'create' ? '/api/admin/team' : `/api/admin/team/${operator?.id}`, {method: mode === 'create' ? 'POST' : 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(mode === 'create' ? {fullName: payload.fullName, email: payload.email, role: payload.role} : {fullName: payload.fullName, role: payload.role, status: payload.status, phone: payload.phone})}); const result = await readResponse(response); if (!response.ok || !result.operator) throw new Error(result.error || 'Salvataggio non riuscito.'); onSaved(toOperator(result.operator), result.warning); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Salvataggio non riuscito.'); } finally { setIsSaving(false); } }
  return <div aria-modal="true" className="modal-backdrop" role="dialog"><section className="client-modal"><header><div><h2>{mode === 'create' ? 'Nuovo operatore' : 'Modifica operatore'}</h2><p>{mode === 'create' ? 'Verrà inviata un’email per impostare una password personale.' : operator?.email}</p></div><button aria-label="Chiudi" className="modal-close" onClick={onClose} type="button"><X size={19} /></button></header><form className="client-form" onSubmit={save}><label className="client-form__wide">Nome e cognome<input defaultValue={operator?.fullName || ''} name="fullName" required /></label><label className="client-form__wide">Email<input defaultValue={operator?.email || ''} disabled={mode === 'edit'} name="email" required type="email" /></label><label>Ruolo<select defaultValue={operator?.role || 'staff'} name="role">{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{mode === 'edit' && operator ? <AvatarField operator={operator} /> : null}{mode === 'edit' ? <label className="client-form__wide">Telefono / WhatsApp<input defaultValue={operator?.phone || ''} inputMode="tel" name="phone" placeholder="+39 333 123 4567" /></label> : null}{mode === 'edit' ? <label>Stato<select defaultValue={operator?.status || 'active'} name="status">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label> : <p className="team-modal-hint"><ShieldCheck size={17} />Il ruolo determina automaticamente l’interfaccia dopo il login.</p>}{error ? <p className="form-error">{error}</p> : null}<footer className="modal-actions"><button className="client-action" disabled={isSaving} onClick={onClose} type="button">Annulla</button><button className="client-action client-action--primary" disabled={isSaving} type="submit"><Check size={16} />{isSaving ? 'Salvataggio...' : mode === 'create' ? 'Invia invito' : 'Salva modifiche'}</button></footer></form></section></div>;
}

function toOperator(value: {id: string; email: string; full_name: string | null; role: TeamRole; status: TeamStatus; created_at: string; phone?: string | null}): TeamOperator { return {id: value.id, email: value.email, fullName: value.full_name || value.email, role: value.role, status: value.status, createdAt: value.created_at, phone: value.phone ?? null}; }
async function readResponse(response: Response) { const contentType = response.headers.get('content-type') || ''; if (contentType.includes('application/json')) return await response.json() as {error?: string; warning?: string; operator?: {id: string; email: string; full_name: string | null; role: TeamRole; status: TeamStatus; created_at: string}}; return {error: response.ok ? 'Risposta non valida dal server.' : 'Il servizio non è disponibile. Riprova tra qualche istante.'}; }

// Photo shown to clients on their dashboard (account managers) and in the portal.
function AvatarField({operator}: {operator: TeamOperator}) {
  const [version, setVersion] = useState<number | undefined>(undefined);
  const [state, setState] = useState('');
  async function upload(file: File) {
    setState('Caricamento…');
    const body = new FormData(); body.append('file', file);
    const response = await fetch(`/api/avatars/${operator.id}`, {method: 'POST', body});
    const result = await response.json().catch(() => ({})) as {error?: string};
    if (!response.ok) { setState(result.error || 'Foto non salvata.'); return; }
    setVersion(Date.now()); setState('Foto aggiornata.');
  }
  return <div className="client-form__wide team-avatar-field"><Avatar key={version} name={operator.fullName || operator.email} profileId={operator.id} size={56} version={version} /><div><strong>Foto profilo</strong><small>I clienti la vedono accanto al nome del loro account manager. JPG, PNG o WebP, max 3 MB.</small><label className="client-action">Carica foto<input accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ''; }} type="file" /></label>{state ? <em>{state}</em> : null}</div></div>;
}

type SyncReport = {changed: Array<{email: string; from: string; to: string}>; pending: Array<{email: string; name: string; role: string; source: string}>; skipped: string[]; invited: string[]};
const syncRoleLabels: Record<string, string> = {admin: 'Admin', staff: 'Team commerciale', graphic_operator: 'Grafico', client: 'Cliente'};

// Result of the last sync: what changed, who is in Airtable but has never been invited, what was left alone.
function SyncPanel({inviting, onInvite, report}: {inviting: string | null; onInvite: (email: string) => void; report: SyncReport}) {
  const nothing = !report.changed.length && !report.pending.length && !report.skipped.length && !report.invited.length;
  return <section className="team-sync">
    <header><RefreshCw size={16} /><strong>{nothing ? 'Tutto allineato con Airtable' : 'Sincronizzazione completata'}</strong></header>
    {report.changed.length ? <div><h4>Accessi aggiornati</h4><ul>{report.changed.map((item) => <li key={item.email}><span>{item.email}</span><small>{item.from} → {item.to}</small></li>)}</ul></div> : null}
    {report.invited.length ? <div><h4>Invitati automaticamente</h4><ul>{report.invited.map((email) => <li key={email}><span>{email}</span><small>Admin in Airtable, nessun admin attivo nel portale</small></li>)}</ul></div> : null}
    {report.pending.length ? <div><h4>In Airtable ma senza accesso al portale</h4><ul>{report.pending.map((item) => <li key={item.email}><span>{item.name ? `${item.name} · ` : ''}{item.email}</span><small>{syncRoleLabels[item.role] || item.role} · da {item.source}</small><button className="client-action" disabled={!!inviting} onClick={() => onInvite(item.email)} type="button"><Mail size={14} />{inviting === item.email ? 'Invio…' : 'Invita'}</button></li>)}</ul></div> : null}
    {report.skipped.length ? <div><h4>Non modificati</h4><ul>{report.skipped.map((item) => <li key={item}><span>{item}</span></li>)}</ul></div> : null}
  </section>;
}
