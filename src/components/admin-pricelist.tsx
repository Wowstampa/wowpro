'use client';

/* eslint-disable @next/next/no-img-element -- Shopify CDN thumbnails */
import Link from 'next/link';
import {useEffect, useMemo, useRef, useState, type FormEvent} from 'react';
import {ArrowLeft, Check, Download, FileUp, Loader2, Package, PenLine, Pencil, Plus, Search, Tags, Trash2, X} from 'lucide-react';

import {useConfirm} from '@/components/confirm-dialog';
import type {ClientPriceItem} from '@/components/client-pricelist';

type Tier = {minQty: number; price: number};
type CatalogProduct = {id: string; title: string; imageUrl: string | null; variants: Array<{id: string; title: string; price: number}>};
export type AdminPriceListClient = {companyId: string; name: string; clientId: string; items: number; updatedAt: string | null; validUntil: string};

const money = (value: number) => new Intl.NumberFormat('it-IT', {style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 4}).format(value);
const qty = (value: number) => new Intl.NumberFormat('it-IT', {useGrouping: 'always'} as Intl.NumberFormatOptions).format(value);
const day = (value: string) => new Intl.DateTimeFormat('it-IT', {day: 'numeric', month: 'short', year: 'numeric'}).format(new Date(value.length === 10 ? `${value}T12:00:00` : value));
const num = (value: string) => Number(String(value).replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
const newId = () => Math.random().toString(36).slice(2, 10);
const CSV_TEMPLATE = 'categoria;prodotto;dettaglio;unita;quantita;prezzo;prezzo_sito;minimo;note\nVolantini;Volantino A5;Patinata opaca 170 g fronte/retro;pz;500;0,09;0,12;500;Consegna in 3 giorni\nVolantini;Volantino A5;Patinata opaca 170 g fronte/retro;pz;1000;0,07;;;\nStriscioni;Striscione in PVC;PVC 510 g con occhielli;mq;1;14;18;1;Minimo fatturato 1 mq a pezzo\nStriscioni;Striscione in PVC;PVC 510 g con occhielli;mq;10;11;;;\n';

// Back-office list of clients with their price list status.
export function AdminPriceListIndex({clients}: {clients: AdminPriceListClient[]}) {
  const [query, setQuery] = useState('');
  const visible = clients.filter((client) => !query.trim() || `${client.name} ${client.clientId}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <>
    <section className="team-toolbar"><div><span className="eyebrow">LISTINI</span><h2>Listini riservati</h2><p>Ogni cliente ha il suo listino: lo vede nel portale sotto Vantaggi › Il tuo listino e i prezzi entrano da soli nei suoi preventivi.</p></div></section>
    <section className="team-directory"><div className="team-directory__filters"><label className="client-search"><Search size={17} /><input onChange={(event) => setQuery(event.target.value)} placeholder="Cerca cliente…" value={query} /></label></div>
      <div className="pl-index">{visible.map((client) => <Link className="pl-index__row" href={`/admin/listini?c=${client.companyId}`} key={client.companyId}>
        <span className="pl-index__icon"><Tags size={18} /></span><div><small>{client.clientId}</small><strong>{client.name}</strong></div>
        <span className={client.items ? 'pl-pill pl-pill--on' : 'pl-pill'}>{client.items ? `${client.items} prodotti` : 'Da preparare'}</span>
        <small>{client.updatedAt ? `Aggiornato il ${day(client.updatedAt)}` : '—'}{client.validUntil ? ` · valido fino al ${day(client.validUntil)}` : ''}</small>
        <span className="client-action"><Pencil size={14} /> {client.items ? 'Modifica' : 'Crea listino'}</span>
      </Link>)}{!visible.length ? <p className="client-list__empty">Nessun cliente corrisponde alla ricerca.</p> : null}</div>
    </section>
  </>;
}

// The editor of one client's price list.
export function AdminPriceListEditor({companyId, clientName, initial}: {companyId: string; clientName: string; initial: {items: ClientPriceItem[]; validUntil: string; note: string; updatedAt: string | null; updatedBy: string | null}}) {
  const [items, setItems] = useState(initial.items);
  const [validUntil, setValidUntil] = useState(initial.validUntil);
  const [note, setNote] = useState(initial.note);
  const [meta, setMeta] = useState({updatedAt: initial.updatedAt, updatedBy: initial.updatedBy});
  const [dirty, setDirty] = useState(false);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<ClientPriceItem | 'new' | null>(null);
  const [searching, setSearching] = useState(false);
  const [confirmUi, ask] = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const categories = useMemo(() => [...new Set(items.map((item) => item.category).filter(Boolean))], [items]);
  const change = (next: ClientPriceItem[]) => { setItems(next); setDirty(true); };

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function save() {
    setError(''); setState('saving');
    try {
      const response = await fetch(`/api/admin/pricelists/${companyId}`, {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({items, validUntil, note})});
      const result = await response.json().catch(() => ({})) as {error?: string; list?: {items: ClientPriceItem[]; updatedAt: string; updatedBy: string}};
      if (!response.ok || !result.list) throw new Error(result.error || 'Listino non salvato.');
      setItems(result.list.items); setMeta({updatedAt: result.list.updatedAt, updatedBy: result.list.updatedBy}); setDirty(false); setState('saved');
      window.setTimeout(() => setState('idle'), 2000);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Listino non salvato.'); setState('idle'); }
  }

  async function remove(item: ClientPriceItem) {
    if ((await ask({title: 'Togliere il prodotto?', message: `${item.title} non comparirà più nel listino del cliente (dopo il salvataggio).`, confirmLabel: 'Togli', tone: 'danger'})) === null) return;
    change(items.filter((entry) => entry.id !== item.id));
  }

  async function importCsv(file: File) {
    setError('');
    try {
      const added = parseCsv(await file.text());
      if (!added.length) throw new Error('Nessun prodotto trovato nel file. Usa il modello CSV.');
      change([...items, ...added]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'File non valido.'); }
  }

  return <>
    {confirmUi}
    <section className="pl-head">
      <Link className="pl-back" href="/admin/listini"><ArrowLeft size={15} /> Tutti i listini</Link>
      <div className="pl-head__row">
        <div><span className="eyebrow">LISTINO RISERVATO</span><h2>{clientName}</h2><p>{items.length} {items.length === 1 ? 'prodotto' : 'prodotti'} · prezzi unitari IVA esclusa{meta.updatedAt ? ` · aggiornato il ${day(meta.updatedAt)}${meta.updatedBy ? ` da ${meta.updatedBy}` : ''}` : ''}</p></div>
        <div className="pl-head__actions">{dirty ? <span className="pl-dirty">Modifiche non salvate</span> : null}<button className="button button--primary" disabled={state === 'saving' || (!dirty && state !== 'saved')} onClick={save} type="button">{state === 'saving' ? <Loader2 className="spin" size={16} /> : <Check size={16} />}{state === 'saving' ? 'Salvataggio…' : state === 'saved' ? 'Salvato' : 'Salva listino'}</button></div>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="pl-settings">
        <label className="ap-field"><span>Valido fino al <small>facoltativo</small></span><input onChange={(event) => { setValidUntil(event.target.value); setDirty(true); }} type="date" value={validUntil} /></label>
        <label className="ap-field"><span>Nota per il cliente <small>facoltativa</small></span><input maxLength={600} onChange={(event) => { setNote(event.target.value); setDirty(true); }} placeholder="Es. Prezzi validi per ordini con consegna a Roma" value={note} /></label>
      </div>
      <div className="pl-tools">
        <button className="button button--primary" onClick={() => setSearching(true)} type="button"><Search size={16} /> Aggiungi dal catalogo</button>
        <button className="button" onClick={() => setEditing('new')} type="button"><PenLine size={16} /> Voce libera</button>
        <button className="button" onClick={() => fileRef.current?.click()} type="button"><FileUp size={16} /> Importa CSV</button>
        <a className="pl-template" download="modello-listino.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`}><Download size={14} /> Modello CSV</a>
        <input accept=".csv,text/csv" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importCsv(file); event.target.value = ''; }} ref={fileRef} type="file" />
      </div>
    </section>

    {items.length ? <div className="pl-table">
      <div className="pl-table__head"><span>Prodotto</span><span>Prezzi per quantità</span><span>Sito</span><span /></div>
      {items.map((item) => <article className="pl-table__row" key={item.id}>
        <div className="pl-prod"><span className="lp-img lp-img--sm">{item.imageUrl ? <img alt="" src={item.imageUrl} /> : <Package size={20} />}</span><div>{item.category ? <small>{item.category}</small> : null}<strong>{item.title}</strong>{item.detail ? <p>{item.detail}</p> : null}{item.note ? <em>{item.note}</em> : null}</div></div>
        <div className="pl-tiers">{item.pricing === 'area' ? <span className="pl-area"><small>al mq</small><b>Base × altezza</b></span> : null}{item.tiers.map((tier) => <span key={tier.minQty}><small>{item.pricing === 'area' ? `da ${tier.minQty} mq` : `${qty(tier.minQty)}+ ${item.unit}`}</small><b>{money(tier.price)}{item.pricing === 'area' ? '/mq' : ''}</b></span>)}</div>
        <div className="pl-site">{item.listPrice ? `${money(item.listPrice)}${item.pricing === 'area' ? '/mq' : ''}` : '—'}{item.pricing === 'area' ? (item.minArea ? <small>min. {item.minArea} mq/pz</small> : null) : item.minQty > 1 ? <small>min. {qty(item.minQty)}</small> : null}</div>
        <div className="pl-row-actions"><button className="client-action" onClick={() => setEditing(item)} type="button"><Pencil size={14} />Modifica</button><button aria-label={`Togli ${item.title}`} className="client-action client-action--ghost" onClick={() => remove(item)} type="button"><Trash2 size={14} /></button></div>
      </article>)}
    </div> : <section className="pm-empty"><span><Tags size={26} /></span><div><strong>Listino vuoto</strong><p>Aggiungi i prodotti dal catalogo Shopify, come voce libera o importando un CSV. Il cliente vedrà il listino appena lo salvi.</p></div></section>}

    {searching ? <CatalogPicker onClose={() => setSearching(false)} onPick={(item) => { setSearching(false); setEditing(item); }} /> : null}
    {editing ? <ItemModal categories={categories} item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSave={(item) => { change(items.some((entry) => entry.id === item.id) ? items.map((entry) => entry.id === item.id ? item : entry) : [...items, item]); setEditing(null); }} /> : null}
  </>;
}

// Search the Shopify catalog and pick a variant: it becomes a price list row to complete.
function CatalogPicker({onClose, onPick}: {onClose: () => void; onPick: (item: ClientPriceItem) => void}) {
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    const timer = window.setTimeout(async () => {
      setState('loading');
      try {
        const response = await fetch(`/api/catalog?q=${encodeURIComponent(term)}`);
        const result = await response.json() as {products?: CatalogProduct[]};
        setProducts(result.products || []); setState(response.ok ? 'idle' : 'error');
      } catch { setState('error'); }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);
  const pick = (product: CatalogProduct, variant: CatalogProduct['variants'][number]) => onPick({id: newId(), category: '', title: product.title, detail: variant.title === 'Default Title' ? '' : variant.title, productId: product.id, variantId: variant.id, imageUrl: product.imageUrl, listPrice: variant.price || null, pricing: 'unit', minArea: 0, unit: 'pz', tiers: [{minQty: 1, price: variant.price || 0}], minQty: 1, note: ''});
  return <div aria-modal="true" className="modal-backdrop" role="dialog"><section className="client-request-modal pl-modal"><header className="client-request-modal__head"><div><h2>Aggiungi dal catalogo</h2><p>Cerca un prodotto WowStampa e scegli la variante: poi imposti il prezzo riservato.</p></div><button aria-label="Chiudi" className="modal-close" onClick={onClose} type="button"><X size={19} /></button></header>
    <div className="client-request-modal__body">
      <label className="lp-search pl-search"><Search size={16} /><input autoFocus onChange={(event) => setQuery(event.target.value)} placeholder="Es. volantini, t-shirt, adesivi…" value={query} />{state === 'loading' ? <Loader2 className="spin" size={16} /> : null}</label>
      {state === 'error' ? <p className="form-error">Catalogo non disponibile al momento.</p> : null}
      <div className="pl-results">{products.map((product) => <div className="pl-result" key={product.id}>
        <span className="lp-img lp-img--sm">{product.imageUrl ? <img alt="" src={product.imageUrl} /> : <Package size={18} />}</span>
        <div><strong>{product.title}</strong><div className="pl-variants">{product.variants.slice(0, 12).map((variant) => <button key={variant.id} onClick={() => pick(product, variant)} type="button">{variant.title === 'Default Title' ? 'Scegli' : variant.title}<small>{money(variant.price)}</small></button>)}</div></div>
      </div>)}{query.trim().length >= 2 && state === 'idle' && !products.length ? <p className="client-list__empty">Nessun prodotto trovato.</p> : null}</div>
    </div>
  </section></div>;
}

function ItemModal({item, categories, onClose, onSave}: {item: ClientPriceItem | null; categories: string[]; onClose: () => void; onSave: (item: ClientPriceItem) => void}) {
  const [tiers, setTiers] = useState<Array<{minQty: string; price: string}>>(() => (item?.tiers.length ? item.tiers : [{minQty: 1, price: 0}]).map((tier) => ({minQty: String(tier.minQty), price: tier.price ? String(tier.price).replace('.', ',') : ''})));
  const [pricing, setPricing] = useState<'unit' | 'area'>(item?.pricing || 'unit');
  const [error, setError] = useState('');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed: Tier[] = tiers.map((tier) => ({minQty: pricing === 'area' ? Math.max(0.01, num(tier.minQty) || 0.01) : Math.round(num(tier.minQty)), price: num(tier.price)})).filter((tier) => tier.minQty > 0 && Number.isFinite(tier.price) && tier.price >= 0);
    if (!parsed.length || parsed.length !== tiers.length) { setError('Inserisci quantità e prezzo per ogni scaglione.'); return; }
    if (new Set(parsed.map((tier) => tier.minQty)).size !== parsed.length) { setError('Due scaglioni hanno la stessa quantità.'); return; }
    const listPrice = String(form.get('listPrice') || '').trim();
    onSave({
      id: item?.id || newId(), category: String(form.get('category') || '').trim(), title: String(form.get('title') || '').trim(), detail: String(form.get('detail') || '').trim(),
      productId: item?.productId || null, variantId: item?.variantId || null, imageUrl: item?.imageUrl || null,
      listPrice: listPrice ? num(listPrice) : null, pricing, minArea: pricing === 'area' ? Math.max(0, num(String(form.get('minArea') || '0')) || 0) : 0, unit: pricing === 'area' ? 'mq' : String(form.get('unit') || 'pz').trim() || 'pz',
      tiers: parsed.sort((a, b) => a.minQty - b.minQty), minQty: Math.max(1, Math.round(num(String(form.get('minQty') || '1'))) || 1), note: String(form.get('note') || '').trim(),
    });
  }
  return <div aria-modal="true" className="modal-backdrop" role="dialog"><section className="client-request-modal pl-modal"><header className="client-request-modal__head"><div><h2>{item?.title ? item.title : 'Nuova voce del listino'}</h2><p>{item?.variantId ? 'Prodotto del catalogo Shopify: nei preventivi il prezzo si applica da solo.' : 'Voce libera: il cliente la usa per chiedere un preventivo con questo prezzo.'}</p></div><button aria-label="Chiudi" className="modal-close" onClick={onClose} type="button"><X size={19} /></button></header>
    <form onSubmit={submit}>
      <div className="client-request-modal__body ap-form">
        <label className="ap-field"><span>Categoria</span><input defaultValue={item?.category || ''} list="pl-categories" maxLength={60} name="category" placeholder="Es. Volantini" /><datalist id="pl-categories">{categories.map((value) => <option key={value} value={value} />)}</datalist></label>
        <label className="ap-field"><span>Nome <b>*</b></span><input defaultValue={item?.title || ''} maxLength={160} name="title" required /></label>
        <div className="ap-field ap-wide"><span>Come si calcola il prezzo</span><div className="ap-seg ap-seg--wide"><button className={pricing === 'unit' ? 'is-on' : ''} onClick={() => setPricing('unit')} type="button">Al pezzo</button><button className={pricing === 'area' ? 'is-on' : ''} onClick={() => setPricing('area')} type="button">Al metro quadro (base × altezza)</button></div></div>
        <label className="ap-field ap-wide"><span>Dettagli</span><input defaultValue={item?.detail || ''} maxLength={400} name="detail" placeholder="Formato, carta, stampa, finiture…" /></label>
        <div className="ap-field ap-wide"><span>{pricing === 'area' ? 'Prezzo al mq' : 'Prezzi per quantità'} <b>*</b> <small>{pricing === 'area' ? 'in base ai mq totali dell’ordine, IVA esclusa' : 'prezzo unitario IVA esclusa'}</small></span>
          <div className="pl-tier-editor">{tiers.map((tier, index) => <div key={index}><label>{pricing === 'area' ? 'Da mq' : 'Da pezzi'}<input inputMode={pricing === 'area' ? 'decimal' : 'numeric'} onChange={(event) => setTiers((current) => current.map((entry, position) => position === index ? {...entry, minQty: event.target.value} : entry))} value={tier.minQty} /></label><label>{pricing === 'area' ? '€ al mq' : 'Prezzo €'}<input inputMode="decimal" onChange={(event) => setTiers((current) => current.map((entry, position) => position === index ? {...entry, price: event.target.value} : entry))} placeholder="0,00" value={tier.price} /></label>{tiers.length > 1 ? <button aria-label="Togli scaglione" onClick={() => setTiers((current) => current.filter((_, position) => position !== index))} type="button"><X size={14} /></button> : null}</div>)}
            {tiers.length < 12 ? <button className="pl-add-tier" onClick={() => setTiers((current) => [...current, {minQty: '', price: ''}])} type="button"><Plus size={14} /> Aggiungi scaglione</button> : null}</div></div>
        <label className="ap-field"><span>Prezzo sul sito{pricing === 'area' ? ' al mq' : ''} <small>per mostrare il risparmio</small></span><input defaultValue={item?.listPrice ? String(item.listPrice).replace('.', ',') : ''} inputMode="decimal" name="listPrice" placeholder="0,00" /></label>
        {pricing === 'area' ? <div className="pl-two"><label className="ap-field"><span>Minimo fatturato <small>mq a pezzo</small></span><input defaultValue={item?.minArea ? String(item.minArea).replace('.', ',') : ''} inputMode="decimal" name="minArea" placeholder="Es. 1" /></label><label className="ap-field"><span>Pezzi minimi</span><input defaultValue={item?.minQty || 1} inputMode="numeric" name="minQty" /></label></div> : <div className="pl-two"><label className="ap-field"><span>Minimo</span><input defaultValue={item?.minQty || 1} inputMode="numeric" name="minQty" /></label><label className="ap-field"><span>Unità</span><input defaultValue={item?.unit || 'pz'} maxLength={20} name="unit" /></label></div>}
        <label className="ap-field ap-wide"><span>Nota per il cliente</span><input defaultValue={item?.note || ''} maxLength={300} name="note" placeholder="Es. Consegna in 3 giorni lavorativi" /></label>
        {error ? <p className="form-error ap-wide">{error}</p> : null}
      </div>
      <footer className="client-request-modal__foot"><small>Le modifiche diventano visibili al cliente quando salvi il listino.</small><span /><button className="client-action" onClick={onClose} type="button">Annulla</button><button className="client-action client-action--primary" type="submit"><Check size={16} />{item ? 'Conferma' : 'Aggiungi'}</button></footer>
    </form>
  </section></div>;
}

// CSV (comma or semicolon): one row per quantity tier; rows with the same category/product/details are merged.
function parseCsv(text: string): ClientPriceItem[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const separator = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
  const split = (line: string) => { const cells: string[] = []; let cell = ''; let quoted = false; for (const char of line) { if (char === '"') quoted = !quoted; else if (char === separator && !quoted) { cells.push(cell); cell = ''; } else cell += char; } cells.push(cell); return cells.map((value) => value.trim()); };
  const header = split(lines[0]).map((value) => value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_'));
  const col = (names: string[]) => header.findIndex((value) => names.includes(value));
  const at = {category: col(['categoria', 'category']), title: col(['prodotto', 'nome', 'product']), detail: col(['dettaglio', 'dettagli', 'descrizione']), unit: col(['unita', 'unit']), qty: col(['quantita', 'qta', 'da']), price: col(['prezzo', 'price']), site: col(['prezzo_sito', 'prezzo_listino']), min: col(['minimo', 'min']), note: col(['note', 'nota'])};
  if (at.title < 0 || at.price < 0) throw new Error('Il file deve avere almeno le colonne "prodotto" e "prezzo".');
  const merged = new Map<string, ClientPriceItem>();
  for (const line of lines.slice(1)) {
    const cells = split(line);
    const get = (index: number) => (index >= 0 ? cells[index] || '' : '');
    const title = get(at.title); const price = num(get(at.price));
    if (!title || !Number.isFinite(price)) continue;
    const key = [get(at.category), title, get(at.detail)].join('|').toLowerCase();
    const isArea = /^(mq|m2|m²)$/i.test(get(at.unit));
    const rawQty = num(get(at.qty));
    const minQty = isArea ? (rawQty > 0 ? rawQty : 1) : Math.max(1, Math.round(rawQty) || 1);
    const existing = merged.get(key);
    if (existing) { if (!existing.tiers.some((tier) => tier.minQty === minQty)) existing.tiers.push({minQty, price}); continue; }
    const site = num(get(at.site)); const min = Math.round(num(get(at.min)));
    const minRaw = num(get(at.min));
    merged.set(key, {id: newId(), category: get(at.category), title, detail: get(at.detail), productId: null, variantId: null, imageUrl: null, listPrice: Number.isFinite(site) && site > 0 ? site : null, pricing: isArea ? 'area' : 'unit', minArea: isArea && Number.isFinite(minRaw) && minRaw > 0 ? minRaw : 0, unit: isArea ? 'mq' : get(at.unit) || 'pz', tiers: [{minQty, price}], minQty: isArea ? 1 : Number.isFinite(min) && min > 0 ? min : minQty, note: get(at.note)});
  }
  return [...merged.values()].map((item) => ({...item, tiers: item.tiers.sort((a, b) => a.minQty - b.minQty)}));
}
