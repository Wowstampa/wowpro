'use client';
/* eslint-disable @next/next/no-img-element -- Shopify CDN images. */

import {Check, ExternalLink, Loader2, Minus, Package, Plus, Ruler, UserRound} from 'lucide-react';
import {useEffect, useMemo, useRef, useState} from 'react';

type Value = {label: string; image: string | null; surcharge: number | null};
type Field =
  | {id: string; kind: 'choice' | 'swatch'; title: string; required: boolean; preselect: string; values: Value[]; showIf: {field: string; value: string} | null}
  | {id: string; kind: 'text'; title: string; required: boolean; preselect: string; values: []; showIf: {field: string; value: string} | null}
  | {id: string; kind: 'heading'; title: string; showIf: null}
  | {id: string; kind: 'sizes'; title: string; sizes: Array<{code: string; name: string}>; showIf: {field: string; value: string} | null};
type Config = {
  handle: string; title: string; url: string; imageUrl: string | null; images: string[];
  options: Array<{name: string; values: string[]}>;
  variants: Array<{id: string; title: string; price: number; options: string[]; imageUrl: string | null; available: boolean}>;
  fields: Field[];
  dimensions: {minWidth: number; minHeight: number; maxWidth: number; maxHeight: number; defaultWidth: number; defaultHeight: number; minAreaM2: number; formats: Array<{label: string; base: number; height: number}>} | null;
};
export type CatalogPick = {id: string; handle: string; title: string; imageUrl: string | null; url: string | null; variants: Array<{id: string; title: string; price: number}>};
export type ConfiguredItem = {productId: string; variantId: string; productTitle: string; variantTitle: string; imageUrl: string | null; quantity: number; note: string; listPrice: number | null; options: Array<{name: string; value: string}>};

const euro = (value: number) => new Intl.NumberFormat('it-IT', {style: 'currency', currency: 'EUR'}).format(value);
const isQuantityOption = (name: string) => /quantit/i.test(name);
// The client can leave a choice to the account manager: it reaches the quote as "to be advised".
const AM = '__account_manager__';
const AM_LABEL = 'Da consigliare (account manager)';

// Product configurator for quote requests: the same options the customer finds on wowstampa.com.
export type PendingResult = {item: ConfiguredItem} | {error: string} | null;

export function QuoteConfigurator({product, onBack, onAdd, registerPending}: {product: CatalogPick; onBack: () => void; onAdd: (item: ConfiguredItem) => void; registerPending?: (build: (() => PendingResult) | null) => void}) {
  const [config, setConfig] = useState<Config | null>(null);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [sizes, setSizes] = useState<Record<string, Record<string, number>>>({});
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch(`/api/catalog/${encodeURIComponent(product.handle)}`, {cache: 'no-store'})
      .then(async (response) => { const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error || 'Dettagli non disponibili.'); return result.product as Config; })
      .then((next) => {
        if (!active) return;
        const first = next.variants.find((variant) => variant.available) || next.variants[0];
        setConfig(next);
        setSelected(first?.options || []);
        setFieldValues(Object.fromEntries(next.fields.filter((field) => field.kind === 'choice' || field.kind === 'swatch' || field.kind === 'text').map((field) => [field.id, 'preselect' in field ? field.preselect : ''])));
        if (next.dimensions) { setWidth(String(next.dimensions.formats[0]?.base || next.dimensions.defaultWidth)); setHeight(String(next.dimensions.formats[0]?.height || next.dimensions.defaultHeight)); }
      })
      .catch((caught) => { if (active) setLoadError(caught instanceof Error ? caught.message : 'Dettagli non disponibili.'); });
    return () => { active = false; };
  }, [product.handle]);

  const delegatedVariant = selected.some((value) => value === AM);
  const variant = useMemo(() => config?.variants.find((item) => item.options.every((value, index) => !config.options[index] || selected[index] === AM || value === selected[index])) || null, [config, selected]);
  const hasQuantityOption = !!config?.options.some((option) => isQuantityOption(option.name));

  function visible(field: Field) {
    if (!field.showIf) return true;
    const {field: source, value} = field.showIf;
    if (/^\d+$/.test(source)) return selected[Number(source) - 1] === value;
    return fieldValues[source] === value;
  }

  const visibleFields = config?.fields.filter(visible) || [];
  const area = (Number(width) || 0) * (Number(height) || 0) / 10_000;
  const shownImage = image || variant?.imageUrl || config?.imageUrl || product.imageUrl;
  const swatchImage = visibleFields.map((field) => (field.kind === 'swatch' ? field.values.find((value) => value.label === fieldValues[field.id])?.image : null)).find(Boolean);

  // Admin prices (the ones used in the draft order) win over the storefront ones.
  const adminPrice = (id?: string) => product.variants.find((item) => item.id === id)?.price;

  // Builds the configured item (or shows what is missing): used by the add button and when the request is sent directly.
  function build(): PendingResult {
    const fail = (message: string): PendingResult => { setError(message); return {error: message}; };
    if (!config) return loadError ? {item: {productId: product.id, variantId: product.variants[0]?.id || '', productTitle: product.title, variantTitle: '', imageUrl: product.imageUrl, quantity, note: note.trim(), listPrice: product.variants[0]?.price ?? null, options: []}} : fail('Attendi il caricamento delle opzioni.');
    setError('');
    const chosen = variant || config.variants[0];
    if (!chosen) return fail('Prodotto non disponibile.');
    const options: ConfiguredItem['options'] = config.options.map((option, index) => ({name: option.name, value: selected[index] === AM ? AM_LABEL : selected[index] || ''})).filter((option) => option.value);
    for (const field of visibleFields) {
      if (field.kind === 'choice' || field.kind === 'swatch' || field.kind === 'text') {
        const raw = (fieldValues[field.id] || '').trim();
        const value = raw === AM ? AM_LABEL : raw;
        if (!value && field.required) return fail(`Scegli: ${field.title}.`);
        if (value) options.push({name: field.title, value});
      }
      if (field.kind === 'sizes') {
        const picked = field.sizes.filter((size) => (sizes[field.id]?.[size.code] || 0) > 0).map((size) => `${size.code}×${sizes[field.id][size.code]}`);
        if (picked.length) options.push({name: field.title, value: picked.join(', ')});
      }
    }
    if (config.dimensions) {
      const base = Number(width); const tall = Number(height);
      if (!base || !tall) return fail('Indica base e altezza in cm.');
      if (base < config.dimensions.minWidth || tall < config.dimensions.minHeight) return fail(`Misura minima ${config.dimensions.minWidth} × ${config.dimensions.minHeight} cm.`);
      if ((config.dimensions.maxWidth && base > config.dimensions.maxWidth) || (config.dimensions.maxHeight && tall > config.dimensions.maxHeight)) return fail(`Misura massima ${config.dimensions.maxWidth || '–'} × ${config.dimensions.maxHeight || '–'} cm.`);
      options.push({name: 'Misure', value: `${base} × ${tall} cm`});
    }
    // A variant left to the account manager: the line arrives without a fixed variant, the offer defines it.
    if (delegatedVariant) return {item: {productId: product.id, variantId: '', productTitle: config.title, variantTitle: '', imageUrl: swatchImage || config.imageUrl || product.imageUrl, quantity: hasQuantityOption ? 1 : quantity, note: note.trim(), listPrice: null, options}};
    return {item: {productId: product.id, variantId: chosen.id, productTitle: config.title, variantTitle: chosen.title, imageUrl: swatchImage || chosen.imageUrl || product.imageUrl, quantity: hasQuantityOption ? 1 : quantity, note: note.trim(), listPrice: adminPrice(chosen.id) ?? chosen.price, options}};
  }

  function add() { const result = build(); if (result && 'item' in result) onAdd(result.item); }

  const buildRef = useRef(build);
  useEffect(() => { buildRef.current = build; });
  useEffect(() => {
    registerPending?.(() => buildRef.current());
    return () => registerPending?.(null);
  }, [registerPending]);

  const fromPrice = adminPrice(variant?.id) ?? variant?.price ?? (product.variants.length ? Math.min(...product.variants.map((item) => item.price)) : null);
  // Step numbers follow the order of the visible sections.
  const stepKeys = [...(config?.options || []).map((option) => `option:${option.name}`), ...(config?.dimensions ? ['dimensions'] : []), ...visibleFields.filter((field) => field.kind !== 'heading').map((field) => `field:${field.id}`)];
  const stepLabel = (key: string) => String(stepKeys.indexOf(key) + 1).padStart(2, '0');

  return <div className="qc">
    <button className="quote-new__back" onClick={onBack} type="button">← Torna ai risultati</button>
    <div className="qc__hero">
      <div className="qc__gallery">
        <div className="qc__image">{shownImage ? <img alt="" src={swatchImage || shownImage} /> : <i><Package size={30} /></i>}</div>
        {config && config.images.length > 1 ? <div className="qc__thumbs">{config.images.slice(0, 5).map((src) => <button className={src === (image || config.imageUrl) ? 'is-active' : ''} key={src} onClick={() => setImage(src)} type="button"><img alt="" src={src} /></button>)}</div> : null}
      </div>
      <div className="qc__title">
        <span className="qc__eyebrow">Configura il prodotto</span>
        <h4>{product.title}</h4>
        {fromPrice !== null ? <p>Prezzo indicativo da <b>{euro(fromPrice)}</b> + IVA<br /><small>Il tuo account manager ti conferma l’offerta con il prezzo WOWPRO riservato.</small></p> : null}
        {config?.url ? <a href={config.url} rel="noreferrer" target="_blank">Vedi sul sito <ExternalLink size={12} /></a> : null}
      </div>
    </div>

    {loadError ? <p className="form-error">{loadError} Puoi comunque descrivere cosa ti serve nei dettagli.</p> : null}
    {loadError ? <label className="buy-field is-wide"><span>Cosa ti serve</span><input maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="Misure, materiale, finiture, quantità…" value={note} /></label> : null}
    {!config && !loadError ? <div className="qc__loading"><Loader2 className="spin" size={18} /> Carico opzioni e misure…</div> : null}

    {config ? <div className="qc__steps">
      {config.options.map((option, index) => <section className="qc__group" key={option.name}>
        <header><b>{stepLabel(`option:${option.name}`)}</b>{option.name}<em>{selected[index] === AM ? 'Deciderà l’account manager' : selected[index]}</em></header>
        <div className="qc__chips">{option.values.map((value) => {
          const available = config.variants.some((item) => item.available && item.options[index] === value && item.options.every((other, position) => position === index || !config.options[position] || other === selected[position]));
          return <button aria-pressed={selected[index] === value} className={`${selected[index] === value ? 'is-active' : ''}${available ? '' : ' is-muted'}`} key={value} onClick={() => setSelected((current) => { const next = [...current]; next[index] = value; return next; })} type="button">{selected[index] === value ? <Check size={13} /> : null}{value}</button>;
        })}{isQuantityOption(option.name) ? null : <AmChip active={selected[index] === AM} onClick={() => setSelected((current) => { const next = [...current]; next[index] = AM; return next; })} />}</div>
      </section>)}

      {config.dimensions ? <section className="qc__group">
        <header><b>{stepLabel('dimensions')}</b>Misure<em>{area ? `${area.toLocaleString('it-IT', {maximumFractionDigits: 2})} m²` : ''}</em></header>
        {config.dimensions.formats.length ? <div className="qc__chips qc__chips--formats">{config.dimensions.formats.map((format) => { const active = Number(width) === format.base && Number(height) === format.height; return <button aria-pressed={active} className={active ? 'is-active' : ''} key={format.label} onClick={() => { setWidth(String(format.base)); setHeight(String(format.height)); }} type="button">{format.label}</button>; })}</div> : null}
        <div className="qc__size">
          <label><span>Base</span><input inputMode="numeric" onChange={(event) => setWidth(event.target.value.replace(/\D/g, '').slice(0, 5))} value={width} /><small>cm</small></label>
          <i>×</i>
          <label><span>Altezza</span><input inputMode="numeric" onChange={(event) => setHeight(event.target.value.replace(/\D/g, '').slice(0, 5))} value={height} /><small>cm</small></label>
        </div>
        <p className="qc__hint"><Ruler size={13} /> Minimo {config.dimensions.minWidth} × {config.dimensions.minHeight} cm{config.dimensions.minAreaM2 ? ` · fatturazione minima ${config.dimensions.minAreaM2.toLocaleString('it-IT', {useGrouping: 'always'} as Intl.NumberFormatOptions)} m²` : ''}</p>
      </section> : null}

      {visibleFields.map((field) => {
        if (field.kind === 'heading') return <h5 className="qc__heading" key={field.id}>{field.title}</h5>;
        if (field.kind === 'sizes') {
          const total = Object.values(sizes[field.id] || {}).reduce((sum, value) => sum + value, 0);
          return <section className="qc__group" key={field.id}>
            <header><b>{stepLabel(`field:${field.id}`)}</b>{field.title}<em>{total ? `${total} pz` : 'indica i pezzi per taglia'}</em></header>
            <div className="qc__sizes">{field.sizes.map((size) => <label key={size.code}><b>{size.code}</b><small>{size.name}</small><input inputMode="numeric" onChange={(event) => { const value = Number(event.target.value.replace(/\D/g, '').slice(0, 5)) || 0; setSizes((current) => ({...current, [field.id]: {...(current[field.id] || {}), [size.code]: value}})); }} placeholder="0" value={sizes[field.id]?.[size.code] || ''} /></label>)}</div>
          </section>;
        }
        if (field.kind === 'text') return <section className="qc__group" key={field.id}>
          <header><b>{stepLabel(`field:${field.id}`)}</b>{field.title}{field.required ? null : <em>facoltativo</em>}</header>
          <input className="qc__input" maxLength={300} onChange={(event) => setFieldValues((current) => ({...current, [field.id]: event.target.value}))} value={fieldValues[field.id] || ''} />
        </section>;
        return <section className="qc__group" key={field.id}>
          <header><b>{stepLabel(`field:${field.id}`)}</b>{field.title}<em>{fieldValues[field.id] === AM ? 'Deciderà l’account manager' : fieldValues[field.id]}</em></header>
          <div className={field.kind === 'swatch' ? 'qc__swatches' : 'qc__chips'}>{field.values.map((value) => {
            const active = fieldValues[field.id] === value.label;
            const choose = () => setFieldValues((current) => ({...current, [field.id]: active && !field.required ? '' : value.label}));
            return field.kind === 'swatch'
              ? <button aria-label={value.label} aria-pressed={active} className={active ? 'is-active' : ''} key={value.label} onClick={choose} title={value.label} type="button">{value.image ? <img alt="" src={value.image} /> : <i>{value.label.slice(0, 2)}</i>}<small>{value.label}</small></button>
              : <button aria-pressed={active} className={active ? 'is-active' : ''} key={value.label} onClick={choose} type="button">{active ? <Check size={13} /> : null}{value.label}{value.surcharge ? <small>+{euro(value.surcharge)}</small> : null}</button>;
          })}<AmChip active={fieldValues[field.id] === AM} onClick={() => setFieldValues((current) => ({...current, [field.id]: current[field.id] === AM && !field.required ? '' : AM}))} /></div>
        </section>;
      })}

      <section className="qc__group qc__group--last">
        {!hasQuantityOption ? <div className="quote-new__qty"><span>Quantità{config.dimensions ? ' (pezzi)' : ''}</span><div><button aria-label="Diminuisci" onClick={() => setQuantity((value) => Math.max(1, value - 1))} type="button"><Minus size={15} /></button><input inputMode="numeric" min={1} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value.replace(/\D/g, '')) || 1))} value={quantity} /><button aria-label="Aumenta" onClick={() => setQuantity((value) => value + 1)} type="button"><Plus size={15} /></button></div></div> : null}
        <label className="buy-field is-wide"><span>Altri dettagli <small>facoltativo</small></span><input maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="Testi, posizione della grafica, richieste particolari…" value={note} /></label>
      </section>
    </div> : null}

    {error ? <p className="form-error">{error}</p> : null}
    <div className="qc__footer">
      <span>{delegatedVariant ? 'Alcune scelte le farà il tuo account manager' : variant?.title || (config?.dimensions && area ? `${width} × ${height} cm` : product.title)}<small>Aggiungi e scegli altri prodotti, oppure invia direttamente la richiesta.</small></span>
      <button className="button button--primary" disabled={!config && !loadError} onClick={add} type="button"><Plus size={16} /> Aggiungi alla richiesta</button>
    </div>
  </div>;
}

// "Not sure? Let my account manager decide" choice, shown next to the options of each step.
function AmChip({active, onClick}: {active: boolean; onClick: () => void}) {
  return <button aria-pressed={active} className={`qc__am${active ? ' is-active' : ''}`} onClick={onClick} title="Non sei sicuro? Il tuo account manager ti consiglia la scelta migliore nell’offerta." type="button">{active ? <Check size={13} /> : <UserRound size={13} />}Lascia decidere al mio account manager</button>;
}
