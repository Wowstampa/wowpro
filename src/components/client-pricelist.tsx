'use client';

/* eslint-disable @next/next/no-img-element -- Shopify CDN thumbnails */
import {useMemo, useState} from 'react';
import {useRouter} from 'next/navigation';
import {ArrowRight, BookOpen, CalendarCheck, Download, Info, Package, Printer, Search, Tags} from 'lucide-react';

import {PageIntro} from '@/components/page-intro';
import {OpenChatButton} from '@/components/support-widget';
import {REORDER_URL, saveReorder} from '@/lib/reorder';

export type ClientPriceItem = {id: string; category: string; title: string; detail: string; productId: string | null; variantId: string | null; imageUrl: string | null; listPrice: number | null; unit: string; tiers: Array<{minQty: number; price: number}>; minQty: number; note: string};
export type ClientPriceList = {items: ClientPriceItem[]; validUntil: string; note: string; updatedAt: string | null};

const money = (value: number) => new Intl.NumberFormat('it-IT', {style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 4}).format(value);
const qty = (value: number) => new Intl.NumberFormat('it-IT', {useGrouping: 'always'} as Intl.NumberFormatOptions).format(value);
const shortDay = (value: string) => new Intl.DateTimeFormat('it-IT', {day: 'numeric', month: 'short'}).format(new Date(value.length === 10 ? `${value}T12:00:00` : value));
const longDay = (value: string) => new Intl.DateTimeFormat('it-IT', {day: 'numeric', month: 'long'}).format(new Date(value.length === 10 ? `${value}T12:00:00` : value));
const best = (item: ClientPriceItem) => Math.min(...item.tiers.map((tier) => tier.price));
const saving = (item: ClientPriceItem) => item.listPrice && item.listPrice > 0 ? Math.round((1 - best(item) / item.listPrice) * 100) : 0;

// Client page "Il tuo listino": the prices agreed with WowStampa, ready to be used in a quote.
export function ClientPriceListView({list, clientName, managerName}: {list: ClientPriceList; clientName: string; managerName: string}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const categories = useMemo(() => [...new Set(list.items.map((item) => item.category || 'Altri prodotti'))], [list.items]);
  const term = query.trim().toLocaleLowerCase('it-IT');
  const visible = list.items.filter((item) => (category === 'all' || (item.category || 'Altri prodotti') === category) && (!term || `${item.title} ${item.detail} ${item.category}`.toLocaleLowerCase('it-IT').includes(term)));
  const savings = list.items.map(saving).filter((value) => value > 0);
  const average = savings.length ? Math.round(savings.reduce((total, value) => total + value, 0) / savings.length) : 0;
  const expired = list.validUntil && list.validUntil < new Date().toISOString().slice(0, 10);

  function quote(item: ClientPriceItem) {
    const price = item.tiers.reduce((current, tier) => (item.minQty >= tier.minQty ? tier.price : current), item.tiers[0]?.price ?? null);
    saveReorder({source: 'il tuo listino', notes: '', items: [{
      productId: item.productId && item.variantId ? item.productId : 'custom', variantId: item.productId && item.variantId ? item.variantId : '',
      productTitle: item.title, variantTitle: item.productId && item.variantId ? item.detail : '', imageUrl: item.imageUrl, quantity: item.minQty,
      note: item.productId && item.variantId ? '' : [item.detail, 'Prezzo dal listino riservato'].filter(Boolean).join(' · '), listPrice: price, options: [],
    }]});
    router.push(REORDER_URL);
  }

  if (!list.items.length) return <section className="lp">
    <PageIntro text="Qui trovi i prezzi concordati con WowStampa per la tua azienda, da usare direttamente nei preventivi." title="Il tuo listino riservato" />
    <section className="pm-empty"><span><Tags size={26} /></span><div><strong>Il tuo listino è in preparazione</strong><p>{managerName || 'Il tuo account manager'} sta preparando i prezzi riservati per {clientName}. Se ti servono subito, scrivigli: ti risponde in chat.</p></div><OpenChatButton className="client-action client-action--primary">Scrivi</OpenChatButton></section>
  </section>;

  return <section className="lp">
    <PageIntro action={<a className="button" href="/api/client/pricelist/pdf"><Download size={16} /> Scarica PDF</a>} text="I prezzi concordati con WowStampa per la tua azienda. Scegli un prodotto e chiedi il preventivo: il prezzo è già applicato." title="Il tuo listino riservato" />
    <div className="lp-sum">
      <div className="lp-sum__main"><small><Tags size={12} /> Listino personalizzato</small><strong>{clientName}</strong><span>{managerName ? `Preparato da ${managerName}, il tuo account manager` : 'Preparato dal team WowStampa'}</span></div>
      <div className="lp-stat"><small>Prodotti nel listino</small><b>{list.items.length}</b><em>{categories.length === 1 ? 'in 1 categoria' : `in ${categories.length} categorie`}</em></div>
      <div className="lp-stat"><small>Risparmio medio</small><b className="g">{average ? `-${average}%` : '—'}</b><em>{average ? 'rispetto ai prezzi del sito' : 'prezzi dedicati a te'}</em></div>
      <div className="lp-stat"><small>Aggiornato il</small><b>{list.updatedAt ? shortDay(list.updatedAt) : '—'}</b><em className={expired ? 'is-expired' : ''}>{list.validUntil ? <><CalendarCheck size={11} /> {expired ? `scaduto il ${longDay(list.validUntil)}` : `valido fino al ${longDay(list.validUntil)}`}</> : 'prezzi IVA esclusa'}</em></div>
    </div>
    {list.note ? <p className="lp-listnote"><Info size={15} /> {list.note}</p> : null}
    <div className="lp-bar">
      <label className="lp-search"><Search size={16} /><input onChange={(event) => setQuery(event.target.value)} placeholder="Cerca nel tuo listino…" value={query} /></label>
      {categories.length > 1 ? <div className="lp-chips"><button className={category === 'all' ? 'is-on' : ''} onClick={() => setCategory('all')} type="button">Tutti <b>{list.items.length}</b></button>{categories.map((value) => <button className={category === value ? 'is-on' : ''} key={value} onClick={() => setCategory(value)} type="button">{value} <b>{list.items.filter((item) => (item.category || 'Altri prodotti') === value).length}</b></button>)}</div> : null}
    </div>
    <div className="lp-list">{visible.map((item) => {
      const pct = saving(item);
      const cheapest = best(item);
      return <article className="lp-item" key={item.id}>
        <span className="lp-img">{item.imageUrl ? <img alt="" src={item.imageUrl} /> : <Package size={32} strokeWidth={1.4} />}</span>
        <div className="lp-info">{item.category ? <small>{item.category}</small> : null}<strong>{item.title}</strong>{item.detail ? <p>{item.detail}</p> : null}
          <div className="lp-price"><b>{item.tiers.length > 1 ? 'da ' : ''}{money(cheapest)}<i>/{item.unit}</i></b>{item.listPrice && item.listPrice > cheapest ? <s>{money(item.listPrice)}</s> : null}{pct > 0 ? <span className="lp-save">-{pct}%</span> : null}</div>
          {item.note ? <span className="lp-note"><Info size={13} /> {item.note}</span> : null}</div>
        {item.tiers.length > 1 ? <div className="lp-tiers">{item.tiers.map((tier) => <div className={tier.price === cheapest ? 'is-best' : ''} key={tier.minQty}><small>{qty(tier.minQty)} {item.unit}</small><b>{money(tier.price)}</b></div>)}</div> : <div className="lp-tiers lp-tiers--single"><div className="is-best"><small>Prezzo unitario</small><b>{money(cheapest)}</b></div></div>}
        <div className="lp-act"><button className="lp-btn" onClick={() => quote(item)} type="button"><Printer size={15} /> Chiedi preventivo</button>{item.minQty > 1 ? <small>Minimo {qty(item.minQty)} {item.unit}</small> : null}</div>
      </article>;
    })}{!visible.length ? <div className="feedback-empty"><Search size={22} /><p>Nessun prodotto corrisponde alla ricerca.</p></div> : null}</div>
    <div className="lp-foot"><BookOpen size={18} /><span>Non trovi un prodotto? <b>Chiedi al tuo account manager</b> di aggiungerlo al listino con un prezzo dedicato. Prezzi unitari IVA esclusa.</span><OpenChatButton className="lp-foot__link">Scrivi{managerName ? ` a ${managerName.split(' ')[0]}` : ''} <ArrowRight size={14} /></OpenChatButton></div>
  </section>;
}
