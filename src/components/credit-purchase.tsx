'use client';

import {useEffect, useRef, useState} from 'react';
import {useRouter} from 'next/navigation';
import {CheckCircle2, CirclePlus, Loader2, ShoppingBag, X} from 'lucide-react';

type CreditPackage = {variantId: string; credits: number; price: number; currency: string; title: string};
type Phase = 'choose' | 'waiting' | 'done';

const POLL_INTERVAL = 4_000;
const MAX_WAIT = 30 * 60_000;
const GRACE_AFTER_CLOSE = 2 * 60_000;

export function CreditPurchase() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('choose');
  const [packages, setPackages] = useState<CreditPackage[] | null>(null);
  const [selected, setSelected] = useState<string>('');
  const [error, setError] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [purchased, setPurchased] = useState(0);
  const [checkoutUrl, setCheckoutUrl] = useState('');
  const [checkoutClosed, setCheckoutClosed] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function open() {
    setIsOpen(true); setPhase('choose'); setError(''); setCheckoutClosed(false);
    if (packages) return;
    try {
      const response = await fetch('/api/client/credits/packages', {cache: 'no-store'});
      const result = await response.json() as {packages?: CreditPackage[]; error?: string};
      if (!response.ok || !result.packages) throw new Error(result.error || 'Pacchetti non disponibili.');
      setPackages(result.packages);
      setSelected(result.packages[Math.min(2, result.packages.length - 1)]?.variantId || '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Pacchetti non disponibili.');
    }
  }

  function close() {
    stopPolling();
    if (phase === 'done') router.refresh();
    setIsOpen(false);
  }

  async function startCheckout() {
    if (!selected) return;
    setIsStarting(true); setError('');
    // The window must be opened synchronously on click, otherwise browsers block it.
    const width = 520; const height = 760;
    const left = Math.max(window.screenX + (window.outerWidth - width) / 2, 0);
    const top = Math.max(window.screenY + (window.outerHeight - height) / 2, 0);
    const popup = window.open('', 'wowpro-checkout', `popup=yes,width=${width},height=${height},left=${left},top=${top}`);
    try {
      const response = await fetch('/api/client/credits/checkout', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({variantId: selected})});
      const result = await response.json() as {checkoutUrl?: string; credits?: number; baselineExtra?: number; error?: string};
      if (!response.ok || !result.checkoutUrl) throw new Error(result.error || 'Impossibile avviare il pagamento.');
      setCheckoutUrl(result.checkoutUrl);
      if (popup && !popup.closed) {
        popup.location.href = result.checkoutUrl;
        popupRef.current = popup;
      } else {
        // Popup blocked: fall back to a new tab.
        popupRef.current = window.open(result.checkoutUrl, '_blank');
      }
      setPhase('waiting');
      startPolling(result.baselineExtra ?? 0);
    } catch (caught) {
      popup?.close();
      setError(caught instanceof Error ? caught.message : 'Impossibile avviare il pagamento.');
    } finally {
      setIsStarting(false);
    }
  }

  function startPolling(baseline: number) {
    stopPolling();
    // Elapsed time is counted in polling ticks to keep the component free of clock reads.
    let elapsed = 0;
    let closedAt = -1;
    pollRef.current = setInterval(async () => {
      elapsed += POLL_INTERVAL;
      const popup = popupRef.current;
      if (popup?.closed && closedAt < 0) { closedAt = elapsed; setCheckoutClosed(true); }
      const expired = elapsed > MAX_WAIT || (closedAt >= 0 && elapsed - closedAt > GRACE_AFTER_CLOSE);
      try {
        const response = await fetch('/api/client/credits/status', {cache: 'no-store'});
        if (response.ok) {
          const {extraCredits} = await response.json() as {extraCredits: number};
          if (extraCredits > baseline) {
            stopPolling();
            try { popupRef.current?.close(); } catch { /* The checkout window may already be gone. */ }
            setPurchased(extraCredits - baseline);
            setPhase('done');
            router.refresh();
            return;
          }
        }
      } catch { /* Temporary network errors: try again on the next tick. */ }
      if (expired) stopPolling();
    }, POLL_INTERVAL);
  }

  function stopPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }

  const current = packages?.find((item) => item.variantId === selected);

  return <>
    <button className="button" onClick={open} type="button"><CirclePlus size={17} /> Acquista crediti extra</button>
    {isOpen ? <div aria-modal="true" className="modal-backdrop" role="dialog"><section className="client-modal credit-shop">
      <header><div><h2>{phase === 'done' ? 'Acquisto completato' : 'Acquista crediti extra'}</h2><p>{phase === 'done' ? 'I crediti sono già disponibili sul tuo account.' : 'I crediti extra non scadono e restano sul tuo account.'}</p></div><button aria-label="Chiudi" className="modal-close" onClick={close} type="button"><X size={19} /></button></header>

      {phase === 'choose' ? <div className="credit-shop__body">
        {!packages && !error ? <p className="credit-shop__loading"><Loader2 className="spin" size={18} /> Caricamento pacchetti...</p> : null}
        {packages ? <div className="credit-shop__grid" role="radiogroup" aria-label="Pacchetti crediti">
          {packages.map((item) => <button aria-checked={selected === item.variantId} className={selected === item.variantId ? 'credit-pack is-selected' : 'credit-pack'} key={item.variantId} onClick={() => setSelected(item.variantId)} role="radio" type="button">
            <strong>{formatNumber(item.credits)}</strong><small>crediti</small><span>{formatPrice(item.price, item.currency)}</span>
          </button>)}
        </div> : null}
        {error ? <p className="form-error">{error}</p> : null}
        <p className="form-hint">Il pagamento avviene sul checkout sicuro di WowStampa, in una finestra separata. Al termine i crediti vengono accreditati automaticamente.</p>
        <footer className="modal-actions"><button className="client-action" onClick={close} type="button">Annulla</button><button className="client-action client-action--violet" disabled={!current || isStarting} onClick={startCheckout} type="button"><ShoppingBag size={16} />{isStarting ? 'Apertura...' : current ? `Acquista ${formatNumber(current.credits)} crediti · ${formatPrice(current.price, current.currency)}` : 'Acquista'}</button></footer>
      </div> : null}

      {phase === 'waiting' ? <div className="credit-shop__body credit-shop__status">
        <Loader2 className="spin" size={30} />
        <h3>In attesa del pagamento</h3>
        <p>Completa l’ordine nella finestra del checkout. Questa pagina si aggiornerà da sola appena il pagamento sarà confermato.</p>
        {checkoutClosed ? <p className="form-hint">Hai chiuso il checkout? Se hai completato il pagamento, i crediti compariranno a breve.</p> : null}
        {checkoutUrl ? <a className="credit-shop__reopen" href={checkoutUrl} onClick={(event) => { event.preventDefault(); popupRef.current = window.open(checkoutUrl, 'wowpro-checkout'); setCheckoutClosed(false); }}>Non vedi il checkout? Riaprilo</a> : null}
      </div> : null}

      {phase === 'done' ? <div className="credit-shop__body credit-shop__status">
        <CheckCircle2 className="credit-shop__ok" size={36} />
        <h3>+{formatNumber(purchased)} crediti extra</h3>
        <p>Grazie! Riceverai la conferma dell’ordine via email.</p>
        <footer className="modal-actions"><button className="client-action client-action--violet" onClick={close} type="button">Chiudi</button></footer>
      </div> : null}
    </section></div> : null}
  </>;
}

function formatNumber(value: number) { return new Intl.NumberFormat('it-IT').format(value); }
function formatPrice(value: number, currency: string) { return new Intl.NumberFormat('it-IT', {style: 'currency', currency: currency || 'EUR'}).format(value); }
