'use client';

import {Building2, Check, Copy, ExternalLink, Landmark, Receipt, X} from 'lucide-react';
import {useEffect, useState} from 'react';
import {createPortal} from 'react-dom';

import {WOWSTAMPA_BANK, transferReason} from '@/lib/bank-details';

type Line = {title: string; quantity: number; unitPrice: number; properties?: Array<{name: string; value: string}>};
type Props = {orderName: string | null; companyName: string; total: number | null; currency: string; lines: Line[]; shipping: number; statusUrl: string | null; onClose: () => void};

const money = (value: number, currency = 'EUR') => new Intl.NumberFormat('it-IT', {style: 'currency', currency}).format(value);
const groupIban = (iban: string) => iban.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();

function CopyField({label, value, display, strong}: {label: string; value: string; display?: string; strong?: boolean}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* Clipboard blocked: the value stays selectable. */ }
  }
  return <div className={strong ? 'bt-field bt-field--strong' : 'bt-field'}>
    <span>{label}</span>
    <strong>{display || value}</strong>
    <button aria-label={`Copia ${label}`} className={copied ? 'is-copied' : ''} onClick={() => void copy()} type="button">{copied ? <><Check size={14} /> Copiato</> : <><Copy size={14} /> Copia</>}</button>
  </div>;
}

// Bank transfer instructions for a quote whose order is waiting for payment.
export function BankTransferModal({orderName, companyName, total, currency, lines, shipping, statusUrl, onClose}: Props) {
  const reason = transferReason(orderName) || `Ordine ${companyName}`;
  const amount = total ?? 0;
  const ready = !!WOWSTAMPA_BANK.iban;
  const [allCopied, setAllCopied] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [onClose]);

  async function copyAll() {
    const text = [`Intestatario: ${WOWSTAMPA_BANK.beneficiary}`, `IBAN: ${WOWSTAMPA_BANK.iban}`, WOWSTAMPA_BANK.bank ? `Banca: ${WOWSTAMPA_BANK.bank}` : '', WOWSTAMPA_BANK.bic ? `BIC/SWIFT: ${WOWSTAMPA_BANK.bic}` : '', `Importo: ${money(amount, currency)}`, `Causale: ${reason}`].filter(Boolean).join('\n');
    try { await navigator.clipboard.writeText(text); setAllCopied(true); setTimeout(() => setAllCopied(false), 1800); } catch { /* Clipboard blocked. */ }
  }

  return createPortal(<div aria-modal="true" className="modal-backdrop bt-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} role="dialog">
    <section className="bt">
      <button aria-label="Chiudi" className="subscription-buy__close" onClick={onClose} type="button"><X size={18} /></button>
      <header className="bt__head">
        <span className="bt__icon"><Landmark size={22} /></span>
        <div><small>Ordine {orderName} · in attesa di pagamento</small><h2>Paga con bonifico</h2></div>
        <div className="bt__amount"><small>Da pagare</small><strong>{money(amount, currency)}</strong><em>IVA inclusa</em></div>
      </header>

      <div className="bt__body">
        <div className="bt__bank">
          <div className="bt__bank-top"><span><Building2 size={15} /> Coordinate bancarie WowStampa</span>{ready ? <button onClick={() => void copyAll()} type="button">{allCopied ? <><Check size={14} /> Dati copiati</> : <><Copy size={14} /> Copia tutto</>}</button> : null}</div>
          {ready ? <>
            <CopyField label="Intestatario" value={WOWSTAMPA_BANK.beneficiary} />
            <CopyField display={groupIban(WOWSTAMPA_BANK.iban)} label="IBAN" strong value={WOWSTAMPA_BANK.iban.replace(/\s+/g, '')} />
            {WOWSTAMPA_BANK.bank || WOWSTAMPA_BANK.bic ? <div className={WOWSTAMPA_BANK.bank && WOWSTAMPA_BANK.bic ? 'bt__pair' : 'bt__single'}>{WOWSTAMPA_BANK.bank ? <CopyField label="Banca" value={WOWSTAMPA_BANK.bank} /> : null}{WOWSTAMPA_BANK.bic ? <CopyField label="BIC / SWIFT" value={WOWSTAMPA_BANK.bic} /> : null}</div> : null}
            <div className="bt__pair"><CopyField display={money(amount, currency)} label="Importo" value={amount.toFixed(2).replace('.', ',')} /><CopyField label="Causale" strong value={reason} /></div>
          </> : <p className="bt__missing">Le coordinate bancarie sono nel riepilogo dell’ordine. Per qualsiasi dubbio scrivi al tuo account manager qui sotto.</p>}
        </div>

        <ol className="bt__steps">
          <li><b>1</b><span><strong>Fai il bonifico</strong> dalla tua banca con i dati qui sopra.</span></li>
          <li><b>2</b><span><strong>Usa la causale esatta</strong> “{reason}”: così lo abbiniamo subito al tuo ordine.</span></li>
          <li><b>3</b><span><strong>Carica la contabile</strong> nel preventivo con “Carica la contabile”: verifichiamo l’accredito (di solito {WOWSTAMPA_BANK.creditDays}) e l’ordine passa in lavorazione.</span></li>
        </ol>

        <div className="bt__summary">
          <h3><Receipt size={15} /> Riepilogo ordine</h3>
          <ul>
            {lines.map((line, index) => <li key={index}><span><b>{line.quantity} ×</b> {line.title}{line.properties?.length ? <small>{line.properties.map((property) => property.name === 'Descrizione' ? property.value : `${property.name}: ${property.value}`).join(' · ')}</small> : null}</span><em>{money(line.unitPrice * line.quantity)}</em></li>)}
            {shipping ? <li><span>Spedizione</span><em>{money(shipping)}</em></li> : null}
          </ul>
          <div className="bt__total"><span>Totale IVA inclusa</span><strong>{money(amount, currency)}</strong></div>
        </div>
      </div>

      <footer className="bt__foot">
        {statusUrl ? <a href={statusUrl} rel="noreferrer" target="_blank">Stato dell’ordine su WowStampa <ExternalLink size={12} /></a> : <span />}
        <button className="button button--primary" onClick={onClose} type="button">Ho capito</button>
      </footer>
    </section>
  </div>, document.body);
}
