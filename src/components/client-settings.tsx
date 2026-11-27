'use client';

import {Bell, Check, Loader2, MessageCircle, Receipt, User, Users} from 'lucide-react';
import {type FormEvent, useState} from 'react';

import {BILLING_FIELDS, type BillingDraft} from '@/components/subscription-actions';
import {OpenChatButton} from '@/components/support-widget';

type Colleague = {id: string; name: string; email: string; status: string; lastLogin: string | null; me: boolean};

async function save(url: string, body: unknown) {
  const response = await fetch(url, {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error((data as {error?: string}).error || 'Salvataggio non riuscito.'), {field: (data as {field?: string}).field});
}

function SaveButton({state}: {state: 'idle' | 'saving' | 'saved'}) {
  return <button className="button button--primary" disabled={state === 'saving'} type="submit">{state === 'saving' ? <Loader2 className="spin" size={16} /> : state === 'saved' ? <Check size={16} /> : null}{state === 'saved' ? 'Salvato' : 'Salva'}</button>;
}

// Account settings: personal profile, invoicing details and who has access to the portal.
type Prefs = {grafica: boolean; preventivi: boolean; messaggi: boolean; idee: boolean; promo: boolean};
const PREF_LABELS: Array<{key: keyof Prefs; title: string; text: string}> = [
  {key: 'grafica', title: 'Richieste grafiche', text: 'Bozze pronte da approvare, richieste completate o rifiutate.'},
  {key: 'preventivi', title: 'Preventivi e ordini', text: 'Preventivi pronti, promemoria di scadenza, pagamenti ricevuti, spedizione express.'},
  {key: 'messaggi', title: 'Messaggi del team', text: 'Nuovi messaggi in chat e commenti sulle tue richieste.'},
  {key: 'promo', title: 'Promo in anteprima', text: 'Quando si sblocca una nuova promozione riservata ai clienti WOWPRO.'},
  {key: 'idee', title: 'Feedback & idee', text: 'Quando un’idea che hai proposto o votato cambia stato o riceve una risposta.'},
];

export function ClientSettings({profile, billing, colleagues, notifications}: {profile: {fullName: string; email: string; phone: string}; billing: BillingDraft; colleagues: Colleague[]; notifications: Prefs | null}) {
  const [person, setPerson] = useState(profile);
  const [personState, setPersonState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [personError, setPersonError] = useState('');
  const [invoice, setInvoice] = useState(billing);
  const [invoiceState, setInvoiceState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [invoiceError, setInvoiceError] = useState('');
  const [errorField, setErrorField] = useState<string | null>(null);
  const [prefs, setPrefs] = useState(notifications);
  const [prefsState, setPrefsState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [prefsError, setPrefsError] = useState('');

  async function savePerson(event: FormEvent) {
    event.preventDefault(); setPersonState('saving'); setPersonError('');
    try { await save('/api/client/profile', {fullName: person.fullName, phone: person.phone}); setPersonState('saved'); setTimeout(() => setPersonState('idle'), 2000); } catch (caught) { setPersonError(caught instanceof Error ? caught.message : 'Non salvato.'); setPersonState('idle'); }
  }
  async function saveInvoice(event: FormEvent) {
    event.preventDefault(); setInvoiceState('saving'); setInvoiceError(''); setErrorField(null);
    try { await save('/api/client/billing', invoice); setInvoiceState('saved'); setTimeout(() => setInvoiceState('idle'), 2000); } catch (caught) { setInvoiceError(caught instanceof Error ? caught.message : 'Non salvato.'); setErrorField((caught as {field?: string}).field || null); setInvoiceState('idle'); }
  }

  async function savePrefs(event: FormEvent) {
    event.preventDefault(); if (!prefs) return; setPrefsState('saving'); setPrefsError('');
    try { await save('/api/client/notifications', prefs); setPrefsState('saved'); setTimeout(() => setPrefsState('idle'), 2000); } catch (caught) { setPrefsError(caught instanceof Error ? caught.message : 'Non salvato.'); setPrefsState('idle'); }
  }

  return <div className="settings">
    <form className="settings-card" onSubmit={savePerson}>
      <header><span className="bk-card__icon"><User size={18} /></span><div><h3>Il tuo profilo</h3><p>Come ti vede il team WowStampa nelle richieste e nei messaggi.</p></div></header>
      <div className="settings-grid">
        <label className="buy-field"><span>Nome e cognome</span><input maxLength={120} onChange={(event) => setPerson((current) => ({...current, fullName: event.target.value}))} required value={person.fullName} /></label>
        <label className="buy-field"><span>Telefono<small>facoltativo</small></span><input maxLength={40} onChange={(event) => setPerson((current) => ({...current, phone: event.target.value}))} placeholder="+39 …" type="tel" value={person.phone} /></label>
        <label className="buy-field is-wide"><span>Email di accesso</span><input disabled value={person.email} /></label>
      </div>
      {personError ? <p className="form-error">{personError}</p> : null}
      <footer><small>Per cambiare l’email di accesso scrivi al tuo account manager.</small><SaveButton state={personState} /></footer>
    </form>

    <form className="settings-card" onSubmit={saveInvoice}>
      <header><span className="bk-card__icon"><Receipt size={18} /></span><div><h3>Dati di fatturazione</h3><p>Usati per le fatture elettroniche di abbonamento, crediti e ordini.</p></div></header>
      <div className="settings-grid">{BILLING_FIELDS.map((config) => <label className={`buy-field${config.wide ? ' is-wide' : ''}${errorField === config.name ? ' has-error' : ''}`} key={config.name}>
        <span>{config.label}{config.optional ? <small>facoltativo</small> : null}</span>
        <input autoComplete="off" maxLength={config.maxLength} onChange={(event) => setInvoice((current) => ({...current, [config.name]: event.target.value}))} placeholder={config.placeholder} value={invoice[config.name]} />
      </label>)}</div>
      {invoiceError ? <p className="form-error">{invoiceError}</p> : null}
      <footer><small>Indica il codice SDI oppure la PEC.</small><SaveButton state={invoiceState} /></footer>
    </form>

    {prefs ? <form className="settings-card" onSubmit={savePrefs}>
      <header><span className="bk-card__icon"><Bell size={18} /></span><div><h3>Notifiche email</h3><p>Scegli per cosa vuoi ricevere un’email. Nel portale trovi comunque sempre tutto.</p></div></header>
      <ul className="settings-prefs">{PREF_LABELS.map((item) => <li key={item.key}><div><strong>{item.title}</strong><small>{item.text}</small></div><label className="switch"><input checked={prefs[item.key]} onChange={(event) => setPrefs((current) => current ? {...current, [item.key]: event.target.checked} : current)} type="checkbox" /><span aria-hidden="true" /><b className="sr-only">{item.title}</b></label></li>)}</ul>
      {prefsError ? <p className="form-error">{prefsError}</p> : null}
      <footer><small>Le email su accesso e sicurezza dell’account arrivano sempre.</small><SaveButton state={prefsState} /></footer>
    </form> : null}

    <section className="settings-card">
      <header><span className="bk-card__icon"><Users size={18} /></span><div><h3>Persone con accesso</h3><p>Chi della tua azienda può entrare nel portale WOWPRO.</p></div></header>
      <ul className="settings-people">{colleagues.map((person) => <li key={person.id}><span className="avatar">{(person.name || person.email).split(/[\s@]/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span><div><strong>{person.name || person.email}{person.me ? <em>Tu</em> : null}</strong><small>{person.email}</small></div><b className={person.status === 'active' ? 'is-active' : ''}>{person.status === 'active' ? 'Attivo' : person.status === 'invited' ? 'Invitato' : 'Sospeso'}</b></li>)}</ul>
      <footer><small>Vuoi dare l’accesso a un collega o toglierlo?</small><OpenChatButton className="button button--ghost"><MessageCircle size={16} /> Chiedi al tuo account manager</OpenChatButton></footer>
    </section>
  </div>;
}
