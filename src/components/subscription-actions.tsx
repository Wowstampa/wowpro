'use client';

import {ExternalLink, Loader2, X} from 'lucide-react';
import {useState} from 'react';

// Actions on the subscription page: (re)activation through the invitation-only Shopify product and a cancellation request.
export function SubscriptionActions({active, options, accountUrl, managerName}: {active: boolean; options: Array<{id: string; label: string; price: string; note: string; url: string}>; accountUrl: string; managerName: string | null}) {
  const [isOpen, setIsOpen] = useState(false);
  const [sent, setSent] = useState(false);

  return <div className="subscription-actions">
    {active
      ? <a className="button button--primary" href={accountUrl} rel="noreferrer" target="_blank">Aggiorna metodo di pagamento <ExternalLink size={15} /></a>
      : <div className="subscription-options">{options.map((option) => <a href={option.url} key={option.id} rel="noreferrer" target="_blank"><strong>{option.label}</strong><b>{option.price}</b><small>{option.note}</small><span>Attiva <ExternalLink size={13} /></span></a>)}</div>}
    {active ? sent ? <span className="subscription-actions__sent">Richiesta di disdetta inviata a {managerName || 'il tuo account manager'}</span> : <button className="button subscription-actions__ghost" onClick={() => setIsOpen(true)} type="button">Richiedi disdetta</button> : null}
    {isOpen ? <CancelModal managerName={managerName} onClose={() => setIsOpen(false)} onSent={() => { setSent(true); setIsOpen(false); }} /> : null}
  </div>;
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
