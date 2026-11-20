'use client';
/* eslint-disable @next/next/no-img-element -- Shopify CDN thumbnails are already resized. */

import {ArrowRight, CheckCircle2, CreditCard, LayoutGrid, PenLine, ExternalLink, FileText, Loader2, Package, Paperclip, Plus, Search, Send, ShoppingBag, Trash2, X} from 'lucide-react';
import {FormEvent, useCallback, useEffect, useMemo, useRef, useState} from 'react';

import {ACCEPTED_FILES, formatBytes, putWithProgress, validateFiles} from '@/components/request-files';
import {QuoteConfigurator, type CatalogPick} from '@/components/quote-configurator';
import {RequestDrawer} from '@/components/request-thread';

type Status = 'new' | 'in_review' | 'quoted' | 'paid' | 'cancelled';
type Item = {productId: string; variantId: string; productTitle: string; variantTitle: string; imageUrl: string | null; quantity: number; note: string; listPrice: number | null; options?: Array<{name: string; value: string}>};
type OfferLine = {variantId: string; title: string; quantity: number; unitPrice: number; properties?: Array<{name: string; value: string}>};
export type QuoteView = {id: string; publicId: string; kind: 'quote' | 'order'; status: Status; companyName: string; requesterName: string; items: Item[]; notes: string; neededBy: string | null; offer: {lines: OfferLine[]; shipping: number; note: string} | null; invoiceUrl: string | null; awaitingPayment?: boolean; total: number | null; currency: string; createdAt: string; quotedAt: string | null; paidAt: string | null; orderName: string | null};
type Message = {id: string; kind: 'comment' | 'event'; body: string; createdAt: string; authorName: string; fromClient: boolean; mine: boolean; file: {name: string; size: number} | null};
type Product = CatalogPick;
const itemDetails = (item: Item) => [item.variantTitle, ...(item.options || []).filter((option) => !item.variantTitle.includes(option.value)).map((option) => `${option.name}: ${option.value}`), (item.options || []).some((option) => /quantit/i.test(option.name)) || item.productId === 'custom' ? '' : `${item.quantity} pz`].filter(Boolean);

const STATUS: Record<Status, {label: string; tone: string}> = {
  new: {label: 'Inviata', tone: 'new'}, in_review: {label: 'In valutazione', tone: 'review'}, quoted: {label: 'Preventivo pronto', tone: 'quoted'}, paid: {label: 'Pagato', tone: 'paid'}, cancelled: {label: 'Annullata', tone: 'cancelled'},
};
const statusOf = (quote: QuoteView) => quote.awaitingPayment ? {label: 'Attesa bonifico', tone: 'review'} : STATUS[quote.status];
const FILTERS = {all: {label: 'Tutte', statuses: null}, open: {label: 'In corso', statuses: ['new', 'in_review']}, quoted: {label: 'Da pagare', statuses: ['quoted']}, closed: {label: 'Chiuse', statuses: ['paid', 'cancelled']}} as const;

const euro = (value: number, currency = 'EUR') => new Intl.NumberFormat('it-IT', {style: 'currency', currency}).format(value);
const shortDate = (value: string) => new Intl.DateTimeFormat('it-IT', {day: 'numeric', month: 'short', year: 'numeric'}).format(new Date(value));
const dateTime = (value: string) => new Intl.DateTimeFormat('it-IT', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}).format(new Date(value));

async function api<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {cache: 'no-store', ...init, headers: {'Content-Type': 'application/json', ...(init?.headers || {})}});
  const result = await response.json().catch(() => ({})) as T & {error?: string};
  if (!response.ok) throw new Error(result.error || 'Operazione non riuscita.');
  return result;
}

// Quote and order requests for WowStampa products: list, new request and detail drawer.
export function QuotesWorkspace({viewer, initialQuotes}: {viewer: 'client' | 'team'; initialQuotes: QuoteView[]}) {
  const [quotes, setQuotes] = useState(initialQuotes);
  const [filter, setFilter] = useState<keyof typeof FILTERS>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('q');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- open the quote linked from an email
    if (id) setOpenId(id);
  }, []);

  const closeDrawer = useCallback(() => { setOpenId(null); if (window.location.search.includes('q=')) window.history.replaceState(null, '', window.location.pathname); }, []);
  const replace = useCallback((quote: QuoteView) => setQuotes((current) => current.some((item) => item.id === quote.id) ? current.map((item) => item.id === quote.id ? quote : item) : [quote, ...current]), []);
  const visible = quotes.filter((quote) => !FILTERS[filter].statuses || (FILTERS[filter].statuses as readonly string[]).includes(quote.status));
  const toPay = quotes.filter((quote) => quote.status === 'quoted' && !quote.awaitingPayment).length;

  return <section className="quotes">
    <header className="quotes__toolbar">
      <div><h2>{viewer === 'client' ? 'Preventivi e ordini' : 'Richieste di preventivo'}</h2><p>{viewer === 'client' ? 'Chiedi un preventivo sui prodotti WowStampa con i tuoi prezzi riservati e paga online quando sei pronto.' : 'Prezza le richieste dei clienti: il preventivo diventa un ordine Shopify che il cliente paga dal portale.'}</p></div>
      {viewer === 'client' ? <button className="button button--primary" onClick={() => setIsCreating(true)} type="button"><Plus size={17} /> Nuova richiesta</button> : null}
    </header>
    {toPay && viewer === 'client' ? <button className="quotes__alert" onClick={() => setFilter('quoted')} type="button"><CreditCard size={18} /><span><b>{toPay === 1 ? 'Hai un preventivo pronto' : `Hai ${toPay} preventivi pronti`}</b> da confermare e pagare.</span></button> : null}
    <div className="quotes__filters" role="tablist">{(Object.keys(FILTERS) as Array<keyof typeof FILTERS>).map((key) => { const statuses = FILTERS[key].statuses as readonly string[] | null; const count = statuses ? quotes.filter((quote) => statuses.includes(quote.status)).length : quotes.length; return <button aria-selected={filter === key} className={filter === key ? 'is-active' : ''} key={key} onClick={() => setFilter(key)} role="tab" type="button">{FILTERS[key].label}{count ? <small>{count}</small> : null}</button>; })}</div>

    {!quotes.length ? <div className="quotes__empty"><span><ShoppingBag size={26} /></span><h3>{viewer === 'client' ? 'Nessuna richiesta, per ora' : 'Nessuna richiesta di preventivo'}</h3><p>{viewer === 'client' ? 'Scegli i prodotti dal catalogo WowStampa, indica quantità e dettagli: il tuo account manager ti manda il preventivo con i prezzi WOWPRO.' : 'Le richieste dei clienti compariranno qui.'}</p>{viewer === 'client' ? <button className="button button--primary" onClick={() => setIsCreating(true)} type="button"><Plus size={17} /> Chiedi un preventivo</button> : null}</div>
      : <div className="quotes__list">
        {visible.map((quote) => <button className="quote-card" key={quote.id} onClick={() => setOpenId(quote.id)} type="button">
          <span className="quote-card__thumbs">{quote.items.slice(0, 3).map((item, index) => item.imageUrl ? <img alt="" key={index} src={item.imageUrl} /> : <i key={index}><Package size={16} /></i>)}</span>
          <span className="quote-card__main"><small>{quote.publicId} · {quote.kind === 'order' ? 'Ordine' : 'Preventivo'}{viewer === 'team' ? ` · ${quote.companyName}` : ''}</small><strong>{quote.items.map((item) => item.productTitle).join(', ')}</strong><em>{quote.items.length} {quote.items.length === 1 ? 'prodotto' : 'prodotti'} · {shortDate(quote.createdAt)}</em></span>
          <span className="quote-card__side"><b className={`quote-status quote-status--${statusOf(quote).tone}`}>{statusOf(quote).label}</b>{quote.total !== null && quote.status !== 'cancelled' ? <strong>{euro(quote.total, quote.currency)}</strong> : null}</span>
        </button>)}
        {!visible.length ? <p className="quotes__none">Nessuna richiesta in questa sezione.</p> : null}
      </div>}

    {viewer === 'client' ? <button className="fab" onClick={() => setIsCreating(true)} type="button"><Plus size={20} /> Preventivo</button> : null}
    {openId ? <RequestDrawer onClose={closeDrawer}><QuoteDetail onChange={replace} quoteId={openId} viewer={viewer} /></RequestDrawer> : null}
    {isCreating ? <NewQuoteModal onClose={() => setIsCreating(false)} onCreated={(quote) => { replace(quote); setIsCreating(false); setOpenId(quote.id); }} /> : null}
  </section>;
}

function NewQuoteModal({onClose, onCreated}: {onClose: () => void; onCreated: (quote: QuoteView) => void}) {
  const [kind, setKind] = useState<'quote' | 'order'>('quote');
  const [term, setTerm] = useState('');
  const [products, setProducts] = useState<Product[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [picked, setPicked] = useState<Product | null>(null);
  const [mode, setMode] = useState<'choose' | 'catalog' | 'custom'>('choose');
  const [items, setItems] = useState<Item[]>([]);
  const [notes, setNotes] = useState('');
  const [neededBy, setNeededBy] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try { setProducts((await api<{products: Product[]}>(`/api/catalog?q=${encodeURIComponent(term)}`)).products); setError(''); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Catalogo non disponibile.'); } finally { setIsSearching(false); }
    }, term ? 350 : 0);
    return () => clearTimeout(timer);
  }, [term]);

  function pick(product: Product) { setPicked(product); setError(''); }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!items.length) { setError('Aggiungi almeno un prodotto.'); return; }
    const fileError = validateFiles(files);
    if (fileError) { setError(fileError); return; }
    setIsSaving(true); setError('');
    try {
      const {quote} = await api<{quote: QuoteView}>('/api/quotes', {method: 'POST', body: JSON.stringify({kind, items, notes, neededBy})});
      for (const [index, file] of files.entries()) {
        setProgress(`Caricamento file ${index + 1} di ${files.length}…`);
        const ticket = await api<{uploadUrl: string; path: string}>(`/api/quotes/${quote.id}/files`, {method: 'POST', body: JSON.stringify({fileName: file.name, size: file.size})});
        await putWithProgress(ticket.uploadUrl, file, () => undefined);
        await api(`/api/quotes/${quote.id}/messages`, {method: 'POST', body: JSON.stringify({body: '', file: {path: ticket.path, name: file.name, size: file.size}})});
      }
      onCreated(quote);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Richiesta non inviata.'); } finally { setIsSaving(false); setProgress(''); }
  }

  return <div aria-modal="true" className="modal-backdrop" role="dialog"><section className="quote-new">
    <button aria-label="Chiudi" className="subscription-buy__close" onClick={onClose} type="button"><X size={18} /></button>
    <form className="quote-new__layout" onSubmit={submit}>
      <div className="quote-new__catalog">
        {mode === 'choose' ? <>
          <header><span className="buy-form__step">Nuova richiesta</span><h3>Come vuoi procedere?</h3></header>
          <div className="quote-new__modes">
            <button onClick={() => setMode('catalog')} type="button"><span><LayoutGrid size={22} /></span><strong>Scegli dal catalogo</strong><small>Prodotti WowStampa con le stesse opzioni del sito: misure, materiali, finiture, colori e taglie.</small><em>Sfoglia il catalogo <ArrowRight size={14} /></em></button>
            <button onClick={() => setMode('custom')} type="button"><span><PenLine size={22} /></span><strong>Richiesta personalizzata</strong><small>Non trovi quello che cerchi o hai un progetto particolare? Descrivilo con parole tue, ti rispondiamo noi.</small><em>Scrivi la richiesta <ArrowRight size={14} /></em></button>
          </div>
        </> : null}
        {mode === 'custom' ? <CustomRequest onAdd={(item) => { setItems((current) => [...current, item]); setMode('choose'); }} onSwitch={() => setMode('catalog')} /> : null}
        {mode === 'catalog' ? <>
        <header className="quote-new__head"><div><span className="buy-form__step">Catalogo WowStampa</span><h3>Scegli i prodotti</h3></div><button className="quote-new__switch" onClick={() => { setPicked(null); setMode('custom'); }} type="button"><PenLine size={14} /> Richiesta personalizzata</button></header>
        <label className="quote-new__search"><Search size={17} /><input autoFocus onChange={(event) => setTerm(event.target.value)} placeholder="Cerca: roll-up, banner, adesivi, t-shirt…" value={term} />{isSearching ? <Loader2 className="spin" size={16} /> : null}</label>
        {picked ? <QuoteConfigurator onAdd={(item) => { setItems((current) => [...current, item]); setPicked(null); }} onBack={() => setPicked(null)} product={picked} />
          : <div className="quote-new__results">
          {products?.map((product) => <button key={product.id} onClick={() => pick(product)} type="button">{product.imageUrl ? <img alt="" src={product.imageUrl} /> : <i><Package size={20} /></i>}<strong>{product.title}</strong><small>{product.variants.length ? `da ${euro(Math.min(...product.variants.map((item) => item.price)))}` : ''}</small></button>)}
          {products && !products.length ? <p className="quotes__none">Nessun prodotto trovato. <button className="quote-new__inline" onClick={() => setMode('custom')} type="button">Fai una richiesta personalizzata</button></p> : null}
        </div>}
        </> : null}
      </div>

      <div className="quote-new__cart">
        <div aria-label="Tipo di richiesta" className="buy-summary__toggle quote-new__kind" role="radiogroup">
          <button aria-checked={kind === 'quote'} className={kind === 'quote' ? 'is-active' : ''} onClick={() => setKind('quote')} role="radio" type="button">Preventivo</button>
          <button aria-checked={kind === 'order'} className={kind === 'order' ? 'is-active' : ''} onClick={() => setKind('order')} role="radio" type="button">Ordine</button>
        </div>
        <p className="quote-new__hint">{kind === 'quote' ? 'Ricevi i prezzi WOWPRO e decidi poi se ordinare.' : 'Sai già cosa ti serve: ti mandiamo l’ordine con i prezzi WOWPRO da pagare.'}</p>
        <h4>La tua richiesta <small>{items.length} {items.length === 1 ? 'prodotto' : 'prodotti'}</small></h4>
        <ul className="quote-new__items">
          {items.map((item, index) => <li key={`${item.variantId}-${index}`}>{item.imageUrl ? <img alt="" src={item.imageUrl} /> : <i>{item.productId === 'custom' ? <PenLine size={16} /> : <Package size={16} />}</i>}<div><strong>{item.productTitle}</strong><small>{[...itemDetails(item), item.note].filter(Boolean).join(' · ')}</small></div><button aria-label="Rimuovi" onClick={() => setItems((current) => current.filter((_, position) => position !== index))} type="button"><Trash2 size={15} /></button></li>)}
          {!items.length ? <li className="quote-new__placeholder">Scegli un prodotto dal catalogo o descrivi una richiesta personalizzata.</li> : null}
        </ul>
        <label className="buy-field is-wide"><span>Note per l’account manager <small>facoltativo</small></span><textarea maxLength={4000} onChange={(event) => setNotes(event.target.value)} placeholder="Tempi, indirizzo di consegna, richieste particolari…" rows={3} value={notes} /></label>
        <label className="buy-field is-wide"><span>Ti serve entro <small>facoltativo</small></span><input onChange={(event) => setNeededBy(event.target.value)} type="date" value={neededBy} /></label>
        <div className="quote-new__files"><input accept={ACCEPTED_FILES} hidden multiple onChange={(event) => setFiles((current) => [...current, ...Array.from(event.target.files || [])])} ref={fileInput} type="file" /><button onClick={() => fileInput.current?.click()} type="button"><Paperclip size={15} /> Allega file grafici</button>{files.map((file, index) => <span key={index}>{file.name} <small>{formatBytes(file.size)}</small><button aria-label="Rimuovi file" onClick={() => setFiles((current) => current.filter((_, position) => position !== index))} type="button"><X size={12} /></button></span>)}</div>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="buy-form__pay" disabled={isSaving || !items.length} type="submit">{isSaving ? <Loader2 className="spin" size={17} /> : <Send size={17} />}{progress || (kind === 'quote' ? 'Chiedi il preventivo' : 'Invia la richiesta d’ordine')}</button>
      </div>
    </form>
  </section></div>;
}

// Free-text request for anything that is not (or not exactly) in the catalog.
function CustomRequest({onAdd, onSwitch}: {onAdd: (item: Item) => void; onSwitch: () => void}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('');
  const [size, setSize] = useState('');
  const [error, setError] = useState('');

  function add() {
    if (title.trim().length < 3) { setError('Dai un nome alla richiesta, ad esempio “Adesivi sagomati per vetrina”.'); return; }
    if (description.trim().length < 10) { setError('Descrivi cosa ti serve: materiale, uso, finiture, quantità…'); return; }
    const options = [size.trim() ? {name: 'Misure', value: size.trim()} : null, quantity.trim() ? {name: 'Quantità indicativa', value: quantity.trim()} : null].filter(Boolean) as Array<{name: string; value: string}>;
    onAdd({productId: 'custom', variantId: '', productTitle: title.trim(), variantTitle: '', imageUrl: null, quantity: Math.max(1, Number(quantity.replace(/\D/g, '')) || 1), note: description.trim(), listPrice: null, options});
  }

  return <div className="quote-custom">
    <header className="quote-new__head"><div><span className="buy-form__step">Richiesta personalizzata</span><h3>Raccontaci cosa ti serve</h3></div><button className="quote-new__switch" onClick={onSwitch} type="button"><LayoutGrid size={14} /> Scegli dal catalogo</button></header>
    <p className="quote-custom__intro">Scrivi con parole tue: il tuo account manager valuta la richiesta, ti propone la soluzione migliore e ti manda il preventivo.</p>
    <label className="buy-field is-wide"><span>Cosa ti serve</span><input maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="Es. Adesivi sagomati per la vetrina del negozio" value={title} /></label>
    <label className="buy-field is-wide"><span>Descrizione</span><textarea maxLength={3000} onChange={(event) => setDescription(event.target.value)} placeholder={'Materiale, utilizzo (interno/esterno), finiture, colori, dove va applicato, idee o riferimenti…'} rows={6} value={description} /><small className="quote-custom__count">{description.length}/3000</small></label>
    <div className="quote-custom__row">
      <label className="buy-field"><span>Quantità <small>indicativa</small></span><input maxLength={60} onChange={(event) => setQuantity(event.target.value)} placeholder="Es. 50 pezzi" value={quantity} /></label>
      <label className="buy-field"><span>Misure <small>facoltativo</small></span><input maxLength={120} onChange={(event) => setSize(event.target.value)} placeholder="Es. 60 × 40 cm" value={size} /></label>
    </div>
    <p className="quote-custom__tip">Hai un file, uno schizzo o una foto di esempio? Allegali a destra con “Allega file grafici”.</p>
    {error ? <p className="form-error">{error}</p> : null}
    <button className="button button--primary" onClick={add} type="button"><Plus size={16} /> Aggiungi alla richiesta</button>
  </div>;
}

function QuoteDetail({quoteId, viewer, onChange}: {quoteId: string; viewer: 'client' | 'team'; onChange: (quote: QuoteView) => void}) {
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState('');
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isActing, setIsActing] = useState(false);
  const [paying, setPaying] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const result = await api<{quote: QuoteView; messages: Message[]}>(`/api/quotes/${quoteId}`);
      setQuote(result.quote); setMessages(result.messages); onChange(result.quote); setError('');
      if (result.quote.status === 'paid' || result.quote.awaitingPayment) setPaying(false);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Preventivo non disponibile.'); }
  }, [quoteId, onChange]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch of external data
    void load();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, paying ? 5_000 : 15_000);
    return () => clearInterval(timer);
  }, [load, paying]);

  async function act(action: 'review' | 'cancel') {
    if (action === 'cancel' && !window.confirm('Vuoi annullare questa richiesta?')) return;
    setIsActing(true);
    try { const result = await api<{quote: QuoteView}>(`/api/quotes/${quoteId}/status`, {method: 'POST', body: JSON.stringify({action})}); onChange(result.quote); await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Operazione non riuscita.'); } finally { setIsActing(false); }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!body.trim() && !file) return;
    setIsSending(true); setError('');
    try {
      let attachment;
      if (file) {
        const fileError = validateFiles([file]);
        if (fileError) throw new Error(fileError);
        const ticket = await api<{uploadUrl: string; path: string}>(`/api/quotes/${quoteId}/files`, {method: 'POST', body: JSON.stringify({fileName: file.name, size: file.size})});
        await putWithProgress(ticket.uploadUrl, file, () => undefined);
        attachment = {path: ticket.path, name: file.name, size: file.size};
      }
      await api(`/api/quotes/${quoteId}/messages`, {method: 'POST', body: JSON.stringify({body: body.trim(), file: attachment})});
      setBody(''); setFile(null); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Messaggio non inviato.'); } finally { setIsSending(false); }
  }

  function pay() {
    if (!quote?.invoiceUrl) return;
    const width = 520; const height = 780;
    window.open(quote.invoiceUrl, 'wowpro-quote', `popup=yes,width=${width},height=${height},left=${Math.max(window.screenX + (window.outerWidth - width) / 2, 0)},top=${Math.max(window.screenY + (window.outerHeight - height) / 2, 0)}`);
    setPaying(true);
  }

  if (!quote) return <div className="rt-loading">{error ? <p className="form-error">{error}</p> : <><Loader2 className="spin" size={20} /> Caricamento…</>}</div>;
  const closed = quote.status === 'paid' || quote.status === 'cancelled';

  return <div className="rt quote-detail">
    <header className="rt-head">
      <div className="rt-head__top"><span className="rt-id">{quote.publicId}</span><span className={`quote-status quote-status--${statusOf(quote).tone}`}>{statusOf(quote).label}</span></div>
      <h2>{quote.kind === 'order' ? 'Richiesta d’ordine' : 'Richiesta di preventivo'}{viewer === 'team' ? ` · ${quote.companyName}` : ''}</h2>
      <div className="rt-meta"><span>Inviata il {shortDate(quote.createdAt)}{viewer === 'team' ? ` da ${quote.requesterName}` : ''}</span>{quote.neededBy ? <span>Serve entro il {shortDate(quote.neededBy)}</span> : null}{quote.orderName ? <span>Ordine {quote.orderName}</span> : null}</div>
    </header>

    {quote.status === 'paid' ? <section className="quote-paid"><CheckCircle2 size={22} /><div><strong>Pagamento ricevuto</strong><p>Ordine {quote.orderName || ''} in lavorazione: lo trovi anche nella pagina Ordini con stato e tracking.</p></div></section> : null}

    {quote.offer && quote.status !== 'cancelled' ? <section className="quote-offer">
      <h3>{quote.status === 'paid' ? 'Riepilogo ordine' : 'Il tuo preventivo'}</h3>
      <ul>{quote.offer.lines.map((line, index) => <li key={index}><span>{line.quantity} × {line.title}{line.properties?.length ? <small className="quote-offer__specs">{line.properties.map((property) => property.name === 'Descrizione' ? property.value : `${property.name}: ${property.value}`).join(' · ')}</small> : null}</span><b>{euro(line.unitPrice * line.quantity)}</b></li>)}{quote.offer.shipping ? <li><span>Spedizione</span><b>{euro(quote.offer.shipping)}</b></li> : null}</ul>
      {quote.offer.note ? <p className="quote-offer__note">{quote.offer.note}</p> : null}
      <div className="quote-offer__total"><span>Totale IVA inclusa</span><strong>{quote.total !== null ? euro(quote.total, quote.currency) : '—'}</strong></div>
      {quote.awaitingPayment ? <div className="quote-transfer"><strong>Ordine {quote.orderName} confermato · in attesa del bonifico</strong><p>{viewer === 'client' ? 'Trovi l’IBAN e la causale nel riepilogo dell’ordine. Appena riceviamo l’accredito l’ordine passa in lavorazione e te lo segnaliamo qui.' : 'Il cliente ha scelto il bonifico. Quando ricevi l’accredito apri l’ordine su Shopify e clicca “Segna come pagato”: il preventivo si aggiorna da solo.'}</p>{quote.invoiceUrl ? <a href={quote.invoiceUrl} rel="noreferrer" target="_blank">{viewer === 'client' ? 'Vedi riepilogo e coordinate bancarie' : 'Apri il riepilogo dell’ordine'} <ExternalLink size={12} /></a> : null}</div> : null}
      {viewer === 'client' && quote.status === 'quoted' && !quote.awaitingPayment && quote.invoiceUrl ? <><button className="buy-form__pay" onClick={pay} type="button"><CreditCard size={17} /> Accetta e paga con carta</button>{paying ? <p className="quote-offer__wait"><Loader2 className="spin" size={14} /> In attesa della conferma del pagamento… <a href={quote.invoiceUrl} rel="noreferrer" target="_blank">Riapri il checkout <ExternalLink size={12} /></a></p> : <p className="quote-offer__wait">Pagamento sicuro sul checkout WowStampa. Hai domande? Scrivi qui sotto.</p>}</> : null}
    </section> : null}

    {viewer === 'team' && !closed && !quote.awaitingPayment ? <OfferEditor onSaved={(next) => { onChange(next); void load(); }} quote={quote} /> : null}

    <section className="rt-section"><h3>Prodotti richiesti</h3>
      <ul className="quote-items">{quote.items.map((item, index) => <li key={index}>{item.imageUrl ? <img alt="" src={item.imageUrl} /> : <i><Package size={16} /></i>}<div><strong>{item.productTitle}</strong><small>{itemDetails(item).join(' · ')}</small>{item.note ? <p>{item.note}</p> : null}</div></li>)}</ul>
      {quote.notes ? <p className="rt-brief">{quote.notes}</p> : null}
    </section>

    <section className="rt-section"><h3>Conversazione</h3>
      <ol className="rt-timeline">
        {messages.map((message) => message.kind === 'event'
          ? <li className="rt-event rt-event--info" key={message.id}><span className="rt-dot" /><p>{message.body}</p><time>{dateTime(message.createdAt)}</time></li>
          : <li className={`rt-comment${message.mine ? ' rt-comment--mine' : ''}`} key={message.id}><span className="rt-avatar">{message.authorName.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span><div><header><b>{message.authorName}</b><time>{dateTime(message.createdAt)}</time></header>{message.body ? <p>{message.body}</p> : null}{message.file ? <a className="quote-file" href={`/api/quotes/files/${message.id}`} rel="noreferrer" target="_blank"><FileText size={15} />{message.file.name}<small>{formatBytes(message.file.size)}</small></a> : null}</div></li>)}
      </ol>
    </section>

    {error ? <p className="form-error">{error}</p> : null}
    {!closed ? <form className="rt-composer" onSubmit={send}>
      <textarea maxLength={4000} onChange={(event) => setBody(event.target.value)} placeholder={viewer === 'client' ? 'Scrivi al tuo account manager…' : 'Scrivi al cliente…'} rows={2} value={body} />
      <div className="rt-composer__bar">
        <span className="quote-composer__left"><input accept={ACCEPTED_FILES} hidden onChange={(event) => setFile(event.target.files?.[0] || null)} ref={fileInput} type="file" /><button className="client-action" onClick={() => fileInput.current?.click()} type="button"><Paperclip size={15} />{file ? file.name : 'Allega'}</button>
          {viewer === 'team' && quote.status === 'new' ? <button className="client-action" disabled={isActing} onClick={() => void act('review')} type="button">Prendi in carico</button> : null}
          {!quote.awaitingPayment ? <button className="client-action client-action--danger" disabled={isActing} onClick={() => void act('cancel')} type="button">Annulla richiesta</button> : null}</span>
        <button className="client-action client-action--primary" disabled={isSending || (!body.trim() && !file)} type="submit">{isSending ? <Loader2 className="spin" size={15} /> : <Send size={15} />}Invia</button>
      </div>
    </form> : null}
  </div>;
}

type DraftLine = {key: string; variantId: string; title: string; quantity: string; unitPrice: string; details: string; request: string};
const detailsToProperties = (details: string) => details.split('\n').map((row) => row.trim()).filter(Boolean).slice(0, 40).map((row) => {
  const at = row.indexOf(':');
  return at > 0 && at < 60 ? {name: row.slice(0, at).trim(), value: row.slice(at + 1).trim() || '-'} : {name: 'Descrizione', value: row};
});
const propertiesToDetails = (properties?: Array<{name: string; value: string}>) => (properties || []).map((property) => property.name === 'Descrizione' ? property.value : `${property.name}: ${property.value}`).join('\n');
const toNumber = (value: string) => Number(value.replace(/\s/g, '').replace(',', '.')) || 0;

// The account manager writes the offer: catalog lines keep the Shopify product, custom lines get the operator's own wording.
function OfferEditor({quote, onSaved}: {quote: QuoteView; onSaved: (quote: QuoteView) => void}) {
  const initial = useMemo<DraftLine[]>(() => {
    if (quote.offer?.lines.length) return quote.offer.lines.map((line, index) => ({key: `o${index}`, variantId: line.variantId, title: line.title, quantity: String(line.quantity), unitPrice: String(line.unitPrice).replace('.', ','), details: propertiesToDetails(line.properties), request: ''}));
    return quote.items.map((item, index) => {
      const custom = !item.variantId;
      const options = (item.options || []).filter((option) => !item.variantTitle.includes(option.value));
      return {
        key: `i${index}`, variantId: item.variantId, title: custom ? item.productTitle : [item.productTitle, item.variantTitle].filter(Boolean).join(' – '),
        quantity: String(item.quantity), unitPrice: item.listPrice ? String(item.listPrice).replace('.', ',') : '',
        details: custom ? '' : [...options.map((option) => `${option.name}: ${option.value}`), ...(item.note ? [`Note: ${item.note}`] : [])].join('\n'),
        request: custom ? [item.productTitle, ...options.map((option) => `${option.name}: ${option.value}`), item.note].filter(Boolean).join('\n') : '',
      };
    });
  }, [quote]);
  const [lines, setLines] = useState(initial);
  const [shipping, setShipping] = useState(String(quote.offer?.shipping || 0));
  const [note, setNote] = useState(quote.offer?.note || '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const subtotal = lines.reduce((total, line) => total + toNumber(line.unitPrice) * (Number(line.quantity) || 0), 0) + toNumber(shipping);
  const requests = quote.items.filter((item) => !item.variantId);
  const update = (key: string, patch: Partial<DraftLine>) => setLines((current) => current.map((line) => line.key === key ? {...line, ...patch} : line));

  async function save() {
    setError('');
    if (!lines.length) { setError('Aggiungi almeno una riga.'); return; }
    const missing = lines.find((line) => !line.title.trim());
    if (missing) { setError('Ogni riga personalizzata deve avere un nome prodotto.'); return; }
    const payload = lines.map((line) => ({variantId: line.variantId, title: line.title.trim(), quantity: Math.max(1, Number(line.quantity) || 1), unitPrice: toNumber(line.unitPrice), properties: detailsToProperties(line.details)}));
    setIsSaving(true);
    try { const result = await api<{quote: QuoteView}>(`/api/quotes/${quote.id}/offer`, {method: 'POST', body: JSON.stringify({lines: payload, shipping: toNumber(shipping), note})}); onSaved(result.quote); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Preventivo non inviato.'); } finally { setIsSaving(false); }
  }

  return <section className="quote-editor">
    <h3>{quote.offer ? 'Aggiorna il preventivo' : 'Prepara il preventivo'}</h3>
    <p>Prezzi unitari IVA esclusa. Scrivi le righe come devono comparire nell’ordine: all’invio viene creato l’ordine bozza in Shopify e il cliente riceve il link per pagare.</p>
    {requests.length ? <div className="quote-request">
      <h4>Richiesta del cliente</h4>
      {requests.map((item, index) => <div key={index}><strong>{item.productTitle}</strong>{(item.options || []).length ? <small>{(item.options || []).map((option) => `${option.name}: ${option.value}`).join(' · ')}</small> : null}{item.note ? <p>{item.note}</p> : null}</div>)}
      {quote.notes ? <p className="quote-request__notes"><b>Note:</b> {quote.notes}</p> : null}
    </div> : null}
    <div className="quote-editor__lines">{lines.map((line) => {
      const custom = !line.variantId;
      return <div className={custom ? 'quote-line quote-line--custom' : 'quote-line'} key={line.key}>
        <header>
          <span className="quote-line__tag">{custom ? <><PenLine size={12} /> Riga personalizzata</> : <><Package size={12} /> Prodotto a catalogo</>}</span>
          <button aria-label="Rimuovi riga" onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))} type="button"><Trash2 size={14} /></button>
        </header>
        {custom ? <label className="quote-line__field"><span>Nome prodotto nell’ordine</span><input maxLength={250} onChange={(event) => update(line.key, {title: event.target.value})} placeholder="Es. Adesivi PVC prespaziati sagomati 60×50 cm" value={line.title} /></label> : <strong className="quote-line__title">{line.title}</strong>}
        <label className="quote-line__field"><span>{custom ? 'Descrizione e specifiche' : 'Specifiche'} <small>una per riga, es. “Materiale: PVC 510g”</small></span><textarea maxLength={3000} onChange={(event) => update(line.key, {details: event.target.value})} placeholder={'Materiale: Vinile polimerico\nFinitura: Laminazione opaca\nLavorazione: Taglio sagomato'} rows={custom ? 4 : Math.min(6, Math.max(2, line.details.split('\n').length))} value={line.details} /></label>
        <div className="quote-line__numbers">
          <label>Q.tà<input inputMode="numeric" onChange={(event) => update(line.key, {quantity: event.target.value.replace(/\D/g, '').slice(0, 6)})} value={line.quantity} /></label>
          <label>€ cad. IVA escl.<input inputMode="decimal" onChange={(event) => update(line.key, {unitPrice: event.target.value.replace(/[^\d,.]/g, '').slice(0, 12)})} placeholder="0,00" value={line.unitPrice} /></label>
          <span>{euro(toNumber(line.unitPrice) * (Number(line.quantity) || 0))}</span>
        </div>
      </div>;
    })}
      <button className="quote-editor__add" onClick={() => setLines((current) => [...current, {key: `n${Date.now()}`, variantId: '', title: '', quantity: '1', unitPrice: '', details: '', request: ''}])} type="button"><Plus size={15} /> Aggiungi riga personalizzata</button>
    </div>
    <div className="quote-editor__extra"><label className="buy-field"><span>Spedizione €</span><input inputMode="decimal" onChange={(event) => setShipping(event.target.value)} value={shipping} /></label><label className="buy-field is-wide"><span>Nota per il cliente <small>facoltativo</small></span><input maxLength={2000} onChange={(event) => setNote(event.target.value)} placeholder="Tempi di produzione, validità dell’offerta…" value={note} /></label></div>
    <footer><span>Imponibile <b>{euro(subtotal)}</b> + IVA</span><button className="client-action client-action--primary" disabled={isSaving} onClick={() => void save()} type="button">{isSaving ? <Loader2 className="spin" size={15} /> : <Send size={15} />}{quote.offer ? 'Aggiorna e reinvia' : 'Invia preventivo'}</button></footer>
    {error ? <p className="form-error">{error}</p> : null}
  </section>;
}
