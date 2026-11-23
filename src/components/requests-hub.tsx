'use client';

import {ArrowRight, Layers, Palette, Plus, Printer, ShoppingBag, X} from 'lucide-react';
import {useCallback, useEffect, useState} from 'react';

import {ClientRequestsWorkspace, type ClientWorkspaceRequest} from '@/components/client-requests-workspace';
import {QuotesWorkspace, type LinkedGraphic, type QuoteView} from '@/components/quotes';

type Tab = 'grafica' | 'preventivi';

// One place for everything the client asks: design requests and print quotes/orders, with a single "Nuova richiesta" entry point.
export function RequestsHub({requests, quotes, includedCredits, extraCredits}: {requests: ClientWorkspaceRequest[]; quotes: QuoteView[]; includedCredits: number; extraCredits: number}) {
  const [tab, setTab] = useState<Tab>('grafica');
  const [choosing, setChoosing] = useState(false);
  const [graphicSignal, setGraphicSignal] = useState<{nonce: number; withPrint: boolean} | null>(null);
  const [quoteSignal, setQuoteSignal] = useState<{nonce: number; linked: LinkedGraphic | null} | null>(null);

  const select = useCallback((next: Tab) => {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    window.history.replaceState(window.history.state, '', url);
  }, []);

  const startGraphic = useCallback((withPrint: boolean) => { setChoosing(false); select('grafica'); setGraphicSignal({nonce: Date.now(), withPrint}); }, [select]);
  const startQuote = useCallback((linked: LinkedGraphic | null) => {
    setChoosing(false); select('preventivi'); setQuoteSignal({nonce: Date.now(), linked});
    // Kept in the URL so the print step survives a reload of the page.
    if (linked) { const url = new URL(window.location.href); url.searchParams.set('stampa', linked.id); window.history.replaceState(window.history.state, '', url); }
  }, [select]);
  const clearPrint = useCallback(() => { const url = new URL(window.location.href); if (!url.searchParams.has('stampa')) return; url.searchParams.delete('stampa'); window.history.replaceState(window.history.state, '', url); }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl: Tab = params.get('tab') === 'preventivi' || params.get('q') ? 'preventivi' : 'grafica';
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tab and creation intent come from the URL (dashboard buttons, email links)
    setTab(fromUrl);
    const intent = params.get('new');
    const printFor = params.get('stampa');
    const pending = printFor ? requests.find((request) => request.id === printFor) : null;
    if (pending) startQuote({id: pending.id, publicId: pending.publicId, title: pending.title});
    else if (intent === 'quote') startQuote(null);
    else if (intent === 'grafica') startGraphic(false);
    else if (intent) setChoosing(true);
    if (intent) { params.delete('new'); window.history.replaceState(window.history.state, '', `${window.location.pathname}${params.toString() ? `?${params}` : ''}`); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once on mount
  }, []);

  const toApprove = requests.filter((request) => request.status === 'review').length;
  const toPay = quotes.filter((quote) => quote.status === 'quoted' && !quote.awaitingPayment).length;

  return <section className="hub">
    <header className="hub__head">
      <div><h2>Le tue richieste</h2><p>Grafiche, preventivi e ordini di stampa: tutto quello che chiedi a WowStampa, in un solo posto.</p></div>
      <button className="button button--primary" onClick={() => setChoosing(true)} type="button"><Plus size={17} /> Nuova richiesta</button>
    </header>
    <div aria-label="Tipo di richiesta" className="hub__tabs" role="tablist">
      <button aria-selected={tab === 'grafica'} className={tab === 'grafica' ? 'is-active' : ''} onClick={() => select('grafica')} role="tab" type="button"><Palette size={16} /> Grafica <small>{requests.length}</small>{toApprove ? <b title="Bozze da approvare">{toApprove}</b> : null}</button>
      <button aria-selected={tab === 'preventivi'} className={tab === 'preventivi' ? 'is-active' : ''} onClick={() => select('preventivi')} role="tab" type="button"><ShoppingBag size={16} /> Preventivi e ordini <small>{quotes.length}</small>{toPay ? <b title="Preventivi da pagare">{toPay}</b> : null}</button>
    </div>
    <div hidden={tab !== 'grafica'}><ClientRequestsWorkspace createSignal={graphicSignal} embedded extraCredits={extraCredits} includedCredits={includedCredits} onOrderPrint={(request) => startQuote(request)} requests={requests} /></div>
    <div hidden={tab !== 'preventivi'}><QuotesWorkspace createSignal={quoteSignal} embedded initialQuotes={quotes} onCreateClosed={clearPrint} viewer="client" /></div>
    <button aria-label="Nuova richiesta" className="fab" onClick={() => setChoosing(true)} type="button"><Plus size={20} /> Nuova richiesta</button>

    {choosing ? <div aria-modal="true" className="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setChoosing(false); }} role="dialog">
      <section className="hub-choose">
        <button aria-label="Chiudi" className="subscription-buy__close" onClick={() => setChoosing(false)} type="button"><X size={18} /></button>
        <header><span className="buy-form__step">Nuova richiesta</span><h3>Cosa ti serve?</h3><p>Scegli da dove partire: puoi sempre scrivere al tuo account manager se hai dubbi.</p></header>
        <div className="hub-choose__options">
          <button onClick={() => startGraphic(false)} type="button"><span className="is-green"><Palette size={22} /></span><strong>Una grafica</strong><small>Revisione, modifica o creazione di un file. Usa i crediti del tuo piano.</small><em>Scegli <ArrowRight size={14} /></em></button>
          <button onClick={() => startQuote(null)} type="button"><span className="is-blue"><Printer size={22} /></span><strong>Un preventivo o un ordine</strong><small>Prodotti WowStampa con i tuoi prezzi riservati, dal catalogo o su misura.</small><em>Scegli <ArrowRight size={14} /></em></button>
          <button className="hub-choose__combo" onClick={() => startGraphic(true)} type="button"><span className="is-violet"><Layers size={22} /></span><strong>Grafica + stampa</strong><small>Prepariamo la grafica e la stampiamo: due richieste collegate, i file passano da soli al preventivo.</small><em>Scegli <ArrowRight size={14} /></em></button>
        </div>
      </section>
    </div> : null}
  </section>;
}
