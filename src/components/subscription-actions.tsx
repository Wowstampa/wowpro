'use client';

import {CheckCircle2, CreditCard, ExternalLink, Loader2, Lock, X} from 'lucide-react';
import {useRouter} from 'next/navigation';
import {FormEvent, useEffect, useRef, useState} from 'react';

export type SubscriptionPlanOption = Option;
type Option = {id: 'monthly' | 'annual'; label: string; price: string; note: string};
export type BillingDraft = {company: string; vatNumber: string; taxCode: string; sdi: string; pec: string; address: string; zip: string; city: string; province: string};

const POLL_INTERVAL = 4_000;
const MAX_WAIT = 30 * 60_000;

// Subscription actions: purchase (plan → billing details → card on the Shopify checkout) or a cancellation request.
export function SubscriptionActions({active, options, accountUrl, managerName, billing, payments}: {active: boolean; options: Option[]; accountUrl: string; managerName: string | null; billing: BillingDraft; payments: number}) {
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [isBuyOpen, setIsBuyOpen] = useState(false);
  const [sent, setSent] = useState(false);

  if (!active) return <div className="subscription-actions">
    <div className="subscription-options">{options.map((option) => <button key={option.id} onClick={() => setIsBuyOpen(true)} type="button"><strong>{option.label}</strong><b>{option.price}</b><small>{option.note}</small></button>)}</div>
    <button className="button button--primary" onClick={() => setIsBuyOpen(true)} type="button"><CreditCard size={17} /> Attiva l’abbonamento</button>
    {isBuyOpen ? <PurchaseModal billing={billing} onClose={() => setIsBuyOpen(false)} options={options} payments={payments} /> : null}
  </div>;

  return <div className="subscription-actions">
    <a className="button button--primary" href={accountUrl} rel="noreferrer" target="_blank">Aggiorna metodo di pagamento <ExternalLink size={15} /></a>
    {sent ? <span className="subscription-actions__sent">Richiesta di disdetta inviata a {managerName || 'il tuo account manager'}</span> : <button className="button subscription-actions__ghost" onClick={() => setIsCancelOpen(true)} type="button">Richiedi disdetta</button>}
    {isCancelOpen ? <CancelModal managerName={managerName} onClose={() => setIsCancelOpen(false)} onSent={() => { setSent(true); setIsCancelOpen(false); }} /> : null}
  </div>;
}

const FIELDS: Array<{name: keyof BillingDraft; label: string; placeholder?: string; wide?: boolean; optional?: boolean; maxLength?: number}> = [
  {name: 'company', label: 'Ragione sociale', wide: true},
  {name: 'vatNumber', label: 'Partita IVA', placeholder: '11 cifre', maxLength: 13},
  {name: 'taxCode', label: 'Codice fiscale', placeholder: 'Se diverso dalla P.IVA', optional: true, maxLength: 16},
  {name: 'sdi', label: 'Codice destinatario SDI', placeholder: '7 caratteri', maxLength: 7},
  {name: 'pec', label: 'PEC', placeholder: 'In alternativa al codice SDI', optional: true},
  {name: 'address', label: 'Indirizzo sede legale', wide: true},
  {name: 'zip', label: 'CAP', maxLength: 5},
  {name: 'city', label: 'Città'},
  {name: 'province', label: 'Provincia', placeholder: 'es. RM', maxLength: 2},
];

export function PurchaseModal({billing, options, payments, onClose, initialPlan}: {billing: BillingDraft; options: Option[]; payments: number; onClose: () => void; initialPlan?: Option['id']}) {
  const router = useRouter();
  const [plan, setPlan] = useState<Option['id']>(initialPlan || options[0]?.id || 'monthly');
  const [form, setForm] = useState(billing);
  const [phase, setPhase] = useState<'form' | 'waiting' | 'done'>('form');
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState('');
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function start(event: FormEvent) {
    event.preventDefault();
    setIsStarting(true); setError(''); setErrorField('');
    // The window must be opened synchronously on submit, otherwise browsers block it.
    const width = 520; const height = 780;
    const popup = window.open('', 'wowpro-subscription', `popup=yes,width=${width},height=${height},left=${Math.max(window.screenX + (window.outerWidth - width) / 2, 0)},top=${Math.max(window.screenY + (window.outerHeight - height) / 2, 0)}`);
    try {
      const response = await fetch('/api/client/subscription/checkout', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({plan, billing: form})});
      const result = await response.json() as {checkoutUrl?: string; error?: string; field?: string};
      if (!response.ok || !result.checkoutUrl) { setErrorField(result.field || ''); throw new Error(result.error || 'Impossibile avviare il pagamento.'); }
      setCheckoutUrl(result.checkoutUrl);
      if (popup && !popup.closed) { popup.location.href = result.checkoutUrl; popupRef.current = popup; } else popupRef.current = window.open(result.checkoutUrl, '_blank');
      setPhase('waiting');
      poll();
    } catch (caught) {
      popup?.close();
      setError(caught instanceof Error ? caught.message : 'Impossibile avviare il pagamento.');
    } finally { setIsStarting(false); }
  }

  function poll() {
    if (pollRef.current) clearInterval(pollRef.current);
    // Elapsed time is counted in polling ticks to keep the component free of clock reads.
    let elapsed = 0;
    pollRef.current = setInterval(async () => {
      elapsed += POLL_INTERVAL;
      try {
        const response = await fetch('/api/client/subscription/status', {cache: 'no-store'});
        if (response.ok && ((await response.json()) as {payments: number}).payments > payments) {
          if (pollRef.current) clearInterval(pollRef.current);
          try { popupRef.current?.close(); } catch { /* The checkout window may already be gone. */ }
          setPhase('done');
          return;
        }
      } catch { /* Temporary network errors: try again on the next tick. */ }
      if (elapsed > MAX_WAIT && pollRef.current) clearInterval(pollRef.current);
    }, POLL_INTERVAL);
  }

  function close() {
    if (pollRef.current) clearInterval(pollRef.current);
    if (phase === 'done') router.refresh();
    onClose();
  }

  return <div aria-modal="true" className="modal-backdrop" role="dialog"><section className="client-modal subscription-buy">
    <header><div><h2>{phase === 'done' ? 'Abbonamento attivo' : 'Attiva WOWPRO'}</h2><p>{phase === 'done' ? 'Benvenuto in WOWPRO: i crediti inclusi sono già disponibili.' : 'Scegli il piano, controlla i dati di fatturazione e paga con carta sul checkout sicuro di WowStampa.'}</p></div><button aria-label="Chiudi" className="modal-close" onClick={close} type="button"><X size={19} /></button></header>

    {phase === 'form' ? <form className="client-form subscription-buy__form" onSubmit={start}>
      <fieldset className="subscription-buy__plans"><legend>Piano</legend>{options.map((option) => <label className={plan === option.id ? 'is-selected' : ''} key={option.id}><input checked={plan === option.id} name="plan" onChange={() => setPlan(option.id)} type="radio" value={option.id} /><strong>{option.label}</strong><b>{option.price}</b><small>{option.note}</small></label>)}</fieldset>
      <fieldset className="subscription-buy__billing"><legend>Dati di fatturazione</legend>
        {FIELDS.map((field) => <label className={`${field.wide ? 'is-wide' : ''}${errorField === field.name ? ' has-error' : ''}`} key={field.name}>{field.label}{field.optional ? <small> (facoltativo)</small> : null}<input autoComplete="off" maxLength={field.maxLength} onChange={(event) => setForm((current) => ({...current, [field.name]: event.target.value}))} placeholder={field.placeholder} required={!field.optional && field.name !== 'sdi'} value={form[field.name]} /></label>)}
      </fieldset>
      <p className="form-hint">Indica il codice SDI oppure la PEC. Le fatture sono emesse da Strategia Associati in Comunicazione S.r.l. con questi dati.</p>
      {error ? <p className="form-error">{error}</p> : null}
      <footer className="modal-actions"><button className="client-action" onClick={close} type="button">Annulla</button><button className="client-action client-action--primary" disabled={isStarting} type="submit">{isStarting ? <Loader2 className="spin" size={15} /> : <Lock size={15} />}Paga con carta</button></footer>
    </form> : null}

    {phase === 'waiting' ? <div className="credit-shop__body credit-shop__status">
      <Loader2 className="spin" size={30} />
      <h3>In attesa del pagamento</h3>
      <p>Inserisci i dati della carta nella finestra del checkout WowStampa. Questa pagina si aggiornerà da sola appena il pagamento sarà confermato.</p>
      {checkoutUrl ? <a className="credit-shop__reopen" href={checkoutUrl} onClick={(event) => { event.preventDefault(); popupRef.current = window.open(checkoutUrl, 'wowpro-subscription'); }}>Non vedi il checkout? Riaprilo</a> : null}
    </div> : null}

    {phase === 'done' ? <div className="credit-shop__body credit-shop__status">
      <CheckCircle2 className="credit-shop__ok" size={36} />
      <h3>Pagamento confermato</h3>
      <p>Riceverai la conferma dell’ordine via email. Il rinnovo è automatico sulla carta che hai usato.</p>
      <footer className="modal-actions"><button className="client-action client-action--primary" onClick={close} type="button">Vai al portale</button></footer>
    </div> : null}
  </section></div>;
}

function CancelModal({managerName, onClose, onSent}: {managerName: string | null; onClose: () => void; onSent: () => void}) {
  const [reason, setReason] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');

  async function send() {
    setIsSending(true); setError('');
    try {
      const response = await fetch('/api/client/subscription/cancel', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({reason})});
      if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as {error?: string}).error || 'Richiesta non inviata. Riprova.');
      onSent();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Richiesta non inviata. Riprova.'); } finally { setIsSending(false); }
  }

  return <div aria-modal="true" className="modal-backdrop" role="dialog"><section className="client-modal"><header><div><h2>Richiedi la disdetta</h2><p>La richiesta arriva a {managerName || 'il tuo account manager'}, che ti ricontatterà per confermare la chiusura. Fino ad allora l’abbonamento resta attivo.</p></div><button aria-label="Chiudi" className="modal-close" onClick={onClose} type="button"><X size={19} /></button></header>
    <div className="client-form"><label>Motivo (facoltativo)<textarea maxLength={1500} onChange={(event) => setReason(event.target.value)} placeholder="Raccontaci perché vuoi disdire: ci aiuta a migliorare." rows={4} value={reason} /></label>{error ? <p className="form-error">{error}</p> : null}
      <div className="modal-actions"><button className="client-action" onClick={onClose} type="button">Annulla</button><button className="client-action client-action--danger" disabled={isSending} onClick={() => void send()} type="button">{isSending ? <Loader2 className="spin" size={15} /> : null}Invia richiesta</button></div></div>
  </section></div>;
}
