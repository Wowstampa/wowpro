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
  const [buyPlan, setBuyPlan] = useState<Option['id'] | null>(null);
  const [sent, setSent] = useState(false);

  if (!active) return <div className="subscription-actions">
    <div className="subscription-options">{options.map((option) => <button key={option.id} onClick={() => setBuyPlan(option.id)} type="button"><strong>{option.label}</strong><b>{option.price}</b><small>{option.note}</small><span><CreditCard size={13} /> Riattiva</span></button>)}</div>
    {buyPlan ? <PurchaseModal billing={billing} initialPlan={buyPlan} onClose={() => setBuyPlan(null)} options={options} payments={payments} /> : null}
  </div>;

  return <div className="subscription-actions">
    <a className="button button--primary" href={accountUrl} rel="noreferrer" target="_blank">Aggiorna metodo di pagamento <ExternalLink size={15} /></a>
    {sent ? <span className="subscription-actions__sent">Richiesta di disdetta inviata a {managerName || 'il tuo account manager'}</span> : <button className="button subscription-actions__ghost" onClick={() => setIsCancelOpen(true)} type="button">Richiedi disdetta</button>}
    {isCancelOpen ? <CancelModal managerName={managerName} onClose={() => setIsCancelOpen(false)} onSent={() => { setSent(true); setIsCancelOpen(false); }} /> : null}
  </div>;
}

export const BILLING_FIELDS: Array<{name: keyof BillingDraft; label: string; placeholder?: string; wide?: boolean; optional?: boolean; maxLength?: number}> = [
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
  const [acceptedTerms, setAcceptedTerms] = useState(false);
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
      const response = await fetch('/api/client/subscription/checkout', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({plan, billing: form, acceptedTerms})});
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

  const field = (name: keyof BillingDraft) => {
    const config = BILLING_FIELDS.find((item) => item.name === name)!;
    return <label className={`buy-field${config.wide ? ' is-wide' : ''}${errorField === name ? ' has-error' : ''}`} key={name}>
      <span>{config.label}{config.optional ? <small>facoltativo</small> : null}</span>
      <input autoComplete="off" maxLength={config.maxLength} onChange={(event) => setForm((current) => ({...current, [name]: event.target.value}))} placeholder={config.placeholder} required={!config.optional && name !== 'sdi'} value={form[name]} />
    </label>;
  };
  const isAnnual = plan === 'annual';

  return <div aria-modal="true" className="modal-backdrop" role="dialog"><section className={`subscription-buy is-${phase}`}>
    <button aria-label="Chiudi" className="subscription-buy__close" onClick={close} type="button"><X size={18} /></button>

    {phase === 'form' ? <form className="subscription-buy__layout" onSubmit={start}>
      <aside className="buy-summary">
        <span className="buy-summary__brand"><b>W</b> WOWPRO</span>
        <h2>Attiva il tuo<br /><em>servizio WOWPRO.</em></h2>
        <div aria-label="Frequenza di pagamento" className="buy-summary__toggle" role="radiogroup">
          {options.map((option) => <button aria-checked={plan === option.id} className={plan === option.id ? 'is-active' : ''} key={option.id} onClick={() => setPlan(option.id)} role="radio" type="button">{option.label}{option.id === 'annual' ? <small>-2 mesi</small> : null}</button>)}
        </div>
        <div className="buy-summary__price"><strong>{isAnnual ? '1.290 €' : '129 €'}</strong><span>+ IVA<br />{isAnnual ? 'all’anno' : 'al mese'}</span></div>
        <p className="buy-summary__note">{isAnnual ? 'Pari a 107,50 € al mese · risparmi 258 €' : 'Rinnovo mensile, disdici quando vuoi'}</p>
        <ul className="buy-summary__list">
          <li><CheckCircle2 size={16} /> 12.000 crediti grafici ogni mese</li>
          <li><CheckCircle2 size={16} /> Grafico e account manager dedicati</li>
          <li><CheckCircle2 size={16} /> Listino riservato e produzione prioritaria</li>
          <li><CheckCircle2 size={16} /> Nessun vincolo di durata</li>
        </ul>
        <p className="buy-summary__secure"><Lock size={13} /> Pagamento con carta sul checkout sicuro di WowStampa</p>
      </aside>

      <div className="buy-form">
        <header className="buy-form__head"><span className="buy-form__step">Passo 1 di 2</span><h3>Dati di fatturazione</h3><p>Li usiamo per la fattura elettronica. Poi paghi con carta.</p></header>
        <fieldset className="buy-group"><legend>Azienda</legend>{field('company')}{field('vatNumber')}{field('taxCode')}</fieldset>
        <fieldset className="buy-group"><legend>Fatturazione elettronica <small>codice SDI oppure PEC</small></legend>{field('sdi')}{field('pec')}</fieldset>
        <fieldset className="buy-group buy-group--address"><legend>Sede legale</legend>{field('address')}{field('zip')}{field('city')}{field('province')}</fieldset>
        <label className="buy-terms"><input checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} required type="checkbox" /><span>Ho letto e accetto i <a href="/termini" rel="noreferrer" target="_blank">Termini del servizio WOWPRO</a> e l’<a href="/privacy" rel="noreferrer" target="_blank">Informativa privacy</a>.</span></label>
        {error ? <p className="form-error">{error}</p> : null}
        <footer className="buy-form__foot">
          <div><small>Totale di oggi</small><strong>{isAnnual ? '1.290 €' : '129 €'} <span>+ IVA</span></strong></div>
          <button className="buy-form__pay" disabled={isStarting} type="submit">{isStarting ? <Loader2 className="spin" size={17} /> : <CreditCard size={17} />}Continua al pagamento</button>
        </footer>
        <p className="buy-form__legal">Fatture emesse da Strategia Associati in Comunicazione S.r.l. · Rinnovo automatico, disdetta in qualsiasi momento.</p>
      </div>
    </form> : null}

    {phase === 'waiting' ? <div className="buy-status">
      <span className="buy-status__icon"><Loader2 className="spin" size={30} /></span>
      <span className="buy-form__step">Passo 2 di 2</span>
      <h3>Completa il pagamento</h3>
      <p>Inserisci i dati della carta nella finestra del checkout WowStampa. Questa pagina si aggiornerà da sola appena il pagamento sarà confermato.</p>
      {checkoutUrl ? <a className="credit-shop__reopen" href={checkoutUrl} onClick={(event) => { event.preventDefault(); popupRef.current = window.open(checkoutUrl, 'wowpro-subscription'); }}>Non vedi il checkout? Riaprilo</a> : null}
    </div> : null}

    {phase === 'done' ? <div className="buy-status buy-status--done">
      <span className="buy-status__icon"><CheckCircle2 size={34} /></span>
      <h3>Benvenuto in WOWPRO!</h3>
      <p>Il pagamento è confermato e i tuoi crediti sono già disponibili. Riceverai la conferma dell’ordine via email.</p>
      <button className="buy-form__pay" onClick={close} type="button">Inizia a usare WOWPRO</button>
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
