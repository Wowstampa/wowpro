'use client';

/* eslint-disable @next/next/no-img-element -- promo pictures come from signed storage URLs */
import {useState, type FormEvent} from 'react';
import {AlertTriangle, CalendarClock, Check, Gift, ImagePlus, Pencil, Plus, RefreshCw, ShoppingBag, Trash2, Users, X} from 'lucide-react';

import {useConfirm} from '@/components/confirm-dialog';
import type {Promo, PromoStage} from '@/lib/promos';

export type AdminPromo = Promo & {stage: PromoStage; orders: number | null};
type Collection = {id: string; title: string};

const STAGES: Record<PromoStage, {label: string; tone: string}> = {upcoming: {label: 'In arrivo', tone: 'upcoming'}, early: {label: 'In anteprima WOWPRO', tone: 'early'}, public: {label: 'Aperta a tutti', tone: 'public'}, ended: {label: 'Conclusa', tone: 'ended'}};
const when = (value: string | null) => value ? new Intl.DateTimeFormat('it-IT', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome'}).format(new Date(value)) : '—';
const discount = (promo: Pick<Promo, 'discountType' | 'value'>) => promo.discountType === 'percentage' ? `-${promo.value}%` : `-${new Intl.NumberFormat('it-IT', {style: 'currency', currency: 'EUR'}).format(promo.value)}`;
// datetime-local works in the browser's time zone (Italy for the team).
const toLocal = (value: string | null) => { if (!value) return ''; const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };
const fromLocal = (value: string) => value ? new Date(value).toISOString() : null;

// Back-office "Promo": WowStampa offers that WOWPRO clients see (and can use) before everyone else.
export function AdminPromos({initialPromos, collections}: {initialPromos: AdminPromo[]; collections: Collection[] | null}) {
  const [promos, setPromos] = useState(initialPromos);
  const [editing, setEditing] = useState<AdminPromo | 'new' | null>(null);
  const [notice, setNotice] = useState('');
  const [confirmUi, ask] = useConfirm();

  async function remove(promo: AdminPromo) {
    if ((await ask({title: 'Eliminare la promo?', message: `${promo.title} sparirà dal portale${promo.shopify.mode === 'auto' ? ' e il codice verrà eliminato da Shopify' : ''}.`, confirmLabel: 'Elimina', tone: 'danger'})) === null) return;
    const response = await fetch(`/api/admin/promos/${promo.id}`, {method: 'DELETE'});
    const result = await response.json().catch(() => ({})) as {error?: string};
    if (!response.ok) { setNotice(result.error || 'Promo non eliminata.'); return; }
    setPromos((current) => current.filter((item) => item.id !== promo.id));
  }

  return <>
    {confirmUi}
    <section className="team-toolbar"><div><span className="eyebrow">MARKETING</span><h2>Promo in anteprima</h2><p>Le offerte WowStampa che i clienti WOWPRO possono usare prima di tutti. Il codice su Shopify vale solo per i clienti con tag WOWPRO fino alla data di uscita pubblica.</p></div><button className="button button--primary" onClick={() => setEditing('new')} type="button"><Plus size={17} />Nuova promo</button></section>
    {notice ? <p className="directory-notice">{notice}</p> : null}
    {promos.length ? <div className="ap-list">{promos.map((promo) => <article className="ap-row" key={promo.id}>
      <span className="ap-thumb">{promo.image ? <img alt="" src={`/api/promos/${promo.id}/image?v=${promo.image.version}`} /> : <Gift size={24} />}<b>{discount(promo)}</b></span>
      <div className="ap-main">
        <div className="ap-top"><span className={`ap-stage ap-stage--${STAGES[promo.stage].tone}`}>{STAGES[promo.stage].label}</span><code>{promo.code}</code>{promo.scope === 'collection' && promo.collectionTitle ? <small>Su: {promo.collectionTitle}</small> : <small>Tutto il sito</small>}</div>
        <strong>{promo.title}</strong>
        <ol className="ap-timeline">
          <li className={promo.stage !== 'upcoming' ? 'is-done' : ''}><i /><span>Anteprima WOWPRO</span><b>{when(promo.earlyStartsAt)}</b></li>
          <li className={promo.stage === 'public' || (promo.stage === 'ended' && promo.publicStartsAt) ? 'is-done' : ''}><i /><span>Per tutti</span><b>{promo.publicStartsAt ? when(promo.publicStartsAt) : 'Mai (solo WOWPRO)'}</b></li>
          <li className={promo.stage === 'ended' ? 'is-done' : ''}><i /><span>Fine</span><b>{promo.endsAt ? when(promo.endsAt) : 'Senza scadenza'}</b></li>
        </ol>
        <div className="ap-meta">
          {promo.shopify.error ? <span className="ap-warn"><AlertTriangle size={14} /> Shopify: {promo.shopify.error}</span>
            : promo.shopify.mode === 'auto' ? <span className="ap-ok"><Check size={14} /> Sconto creato su Shopify{promo.shopify.openedToAll ? ' · aperto a tutti' : ' · solo clienti WOWPRO'}</span>
            : <span><ShoppingBag size={14} /> Codice gestito a mano su Shopify</span>}
          {promo.orders !== null ? <span><ShoppingBag size={14} /> Usata in {promo.orders} {promo.orders === 1 ? 'ordine' : 'ordini'}</span> : null}
          {promo.watchers.length ? <span><Users size={14} /> {promo.watchers.length} {promo.watchers.length === 1 ? 'cliente aspetta' : 'clienti aspettano'} il lancio</span> : null}
          {promo.notifiedAt ? <span><Check size={14} /> Email di lancio inviata</span> : null}
        </div>
      </div>
      <div className="ap-actions"><button className="client-action" onClick={() => setEditing(promo)} type="button"><Pencil size={15} />Modifica</button><button aria-label="Elimina" className="client-action client-action--ghost" onClick={() => remove(promo)} type="button"><Trash2 size={15} /></button></div>
    </article>)}</div>
      : <section className="pm-empty"><span><Gift size={26} /></span><div><strong>Nessuna promo ancora</strong><p>Crea la prima: i clienti WOWPRO la vedranno nella sezione Promozioni e riceveranno un’email al lancio.</p></div></section>}
    {editing ? <PromoModal collections={collections} onClose={() => setEditing(null)} onSaved={(promo, message) => { setPromos((current) => current.some((item) => item.id === promo.id) ? current.map((item) => item.id === promo.id ? promo : item) : [promo, ...current]); setEditing(null); setNotice(message); }} promo={editing === 'new' ? null : editing} /> : null}
  </>;
}

function PromoModal({promo, collections, onClose, onSaved}: {promo: AdminPromo | null; collections: Collection[] | null; onClose: () => void; onSaved: (promo: AdminPromo, message: string) => void}) {
  const [start] = useState(() => promo?.earlyStartsAt || new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000).toISOString());
  const [discountType, setDiscountType] = useState<Promo['discountType']>(promo?.discountType || 'percentage');
  const [scope, setScope] = useState<Promo['scope']>(promo?.scope || 'all');
  const [mode, setMode] = useState<Promo['shopify']['mode']>(promo?.shopify.mode || 'auto');
  const [openToAll, setOpenToAll] = useState(promo ? !!promo.publicStartsAt : true);
  const [code, setCode] = useState(promo?.code || '');
  const [early, setEarly] = useState(toLocal(start));
  const [publicAt, setPublicAt] = useState(toLocal(promo?.publicStartsAt || new Date(Date.parse(start) + 48 * 3_600_000).toISOString()));
  const [image, setImage] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setIsSaving(true);
    const form = new FormData(event.currentTarget);
    const collectionId = String(form.get('collectionId') || '') || null;
    const payload = {
      title: String(form.get('title') || ''), description: String(form.get('description') || ''), discountType, value: Number(String(form.get('value') || '').replace(',', '.')),
      scope, collectionId: scope === 'collection' ? collectionId : null, collectionTitle: scope === 'collection' ? collections?.find((item) => item.id === collectionId)?.title || null : null,
      code, link: String(form.get('link') || ''), earlyStartsAt: fromLocal(early), publicStartsAt: openToAll ? fromLocal(publicAt) : null, endsAt: fromLocal(String(form.get('endsAt') || '')), shopifyMode: mode,
    };
    try {
      const response = await fetch(promo ? `/api/admin/promos/${promo.id}` : '/api/admin/promos', {method: promo ? 'PATCH' : 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
      const result = await response.json().catch(() => ({})) as {error?: string; promo?: Promo};
      if (!response.ok || !result.promo) throw new Error(result.error || 'Promo non salvata.');
      let saved = result.promo;
      if (image) {
        const body = new FormData(); body.append('file', image);
        const upload = await fetch(`/api/admin/promos/${saved.id}/image`, {method: 'POST', body});
        const uploaded = await upload.json().catch(() => ({})) as {error?: string; promo?: Promo};
        if (upload.ok && uploaded.promo) saved = uploaded.promo; else setError(uploaded.error || 'Immagine non caricata.');
      }
      const now = Date.now();
      const stage: PromoStage = saved.endsAt && now >= Date.parse(saved.endsAt) ? 'ended' : now < Date.parse(saved.earlyStartsAt) ? 'upcoming' : saved.publicStartsAt && now >= Date.parse(saved.publicStartsAt) ? 'public' : 'early';
      onSaved({...saved, stage, orders: promo?.orders ?? null}, saved.shopify.error ? `Promo salvata, ma Shopify ha dato un errore: ${saved.shopify.error}` : promo ? 'Promo aggiornata.' : 'Promo creata: i clienti WOWPRO la vedranno nella sezione Promozioni.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Promo non salvata.'); } finally { setIsSaving(false); }
  }

  const generate = () => setCode(`WOWPRO-${Math.random().toString(36).slice(2, 7).toUpperCase()}`);

  return <div aria-modal="true" className="modal-backdrop" role="dialog"><section aria-labelledby="promoTitle" className="client-request-modal ap-modal"><header className="client-request-modal__head"><div><h2 id="promoTitle">{promo ? 'Modifica promo' : 'Nuova promo'}</h2><p>I clienti WOWPRO la vedono nella sezione Promozioni e ricevono un’email all’inizio dell’anteprima.</p></div><button aria-label="Chiudi" className="modal-close" onClick={onClose} type="button"><X size={19} /></button></header>
    <form onSubmit={save}>
      <div className="client-request-modal__body ap-form">
        <label className="ap-field ap-wide"><span>Titolo <b>*</b></span><input defaultValue={promo?.title || ''} maxLength={120} name="title" placeholder="Es. Black Friday abbigliamento personalizzato" required /></label>
        <label className="ap-field ap-wide"><span>Descrizione</span><textarea defaultValue={promo?.description || ''} maxLength={600} name="description" placeholder="Cosa è in promo e per chi è utile" rows={3} /></label>

        <div className="ap-field"><span>Sconto <b>*</b></span><div className="ap-inline"><div className="ap-seg">{(['percentage', 'amount'] as const).map((value) => <button className={discountType === value ? 'is-on' : ''} key={value} onClick={() => setDiscountType(value)} type="button">{value === 'percentage' ? '%' : '€'}</button>)}</div><input defaultValue={promo?.value ?? ''} inputMode="decimal" name="value" placeholder={discountType === 'percentage' ? '20' : '10,00'} required /></div></div>
        <div className="ap-field"><span>Su cosa</span><div className="ap-seg ap-seg--wide">{(['all', 'collection'] as const).map((value) => <button className={scope === value ? 'is-on' : ''} key={value} onClick={() => setScope(value)} type="button">{value === 'all' ? 'Tutto il sito' : 'Una collezione'}</button>)}</div>
          {scope === 'collection' ? collections?.length ? <select defaultValue={promo?.collectionId || ''} name="collectionId" required><option disabled value="">Scegli la collezione…</option>{collections.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select> : <small className="ap-hint">Collezioni Shopify non disponibili: usa “Tutto il sito” o il codice manuale.</small> : null}</div>

        <label className="ap-field"><span>Codice <b>*</b></span><div className="ap-inline"><input maxLength={40} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))} placeholder="WOWPRO-BF20" required value={code} /><button className="client-action" onClick={generate} type="button"><RefreshCw size={14} />Genera</button></div></label>
        <label className="ap-field"><span>Link al sito <small>facoltativo</small></span><input defaultValue={promo?.link || ''} name="link" placeholder="https://wowstampa.com/collections/…" /></label>

        <fieldset className="ap-dates ap-wide"><legend><CalendarClock size={15} /> Calendario</legend>
          <label className="ap-field"><span>Inizio anteprima WOWPRO <b>*</b></span><input onChange={(event) => setEarly(event.target.value)} required type="datetime-local" value={early} /></label>
          <label className="ap-field"><span className="ap-check"><input checked={openToAll} onChange={(event) => setOpenToAll(event.target.checked)} type="checkbox" /> Apri a tutti il</span><input disabled={!openToAll} onChange={(event) => setPublicAt(event.target.value)} type="datetime-local" value={openToAll ? publicAt : ''} /></label>
          <label className="ap-field"><span>Fine promo <small>facoltativa</small></span><input defaultValue={toLocal(promo?.endsAt || null)} name="endsAt" type="datetime-local" /></label>
        </fieldset>

        <fieldset className="service-picker ap-modes ap-wide"><legend>Sconto su Shopify</legend>
          <button aria-pressed={mode === 'auto'} className={mode === 'auto' ? 'is-selected' : ''} onClick={() => setMode('auto')} type="button"><span className="service-picker__check">{mode === 'auto' ? <Check size={14} /> : null}</span><span>Crealo il portale <em>consigliato</em></span><small>Codice valido solo per i clienti con tag WOWPRO, aperto a tutti in automatico alla data.</small></button>
          <button aria-pressed={mode === 'manual'} className={mode === 'manual' ? 'is-selected' : ''} onClick={() => setMode('manual')} type="button"><span className="service-picker__check">{mode === 'manual' ? <Check size={14} /> : null}</span><span>L’ho già creato io</span><small>Il portale mostra solo il codice: limiti e date li gestisci su Shopify.</small></button>
        </fieldset>

        <label className="ap-image ap-wide"><input accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => setImage(event.target.files?.[0] || null)} type="file" /><ImagePlus size={18} /><span>{image ? image.name : promo?.image ? 'Sostituisci l’immagine' : 'Aggiungi un’immagine'}</span><small>JPG, PNG o WebP · max 5 MB · consigliata orizzontale</small></label>
        {error ? <p className="form-error ap-wide">{error}</p> : null}
      </div>
      <footer className="client-request-modal__foot"><small>{mode === 'auto' ? 'Al salvataggio lo sconto viene creato o aggiornato su Shopify.' : 'Ricordati di limitare il codice ai clienti WOWPRO su Shopify.'}</small><span /><button className="client-action" disabled={isSaving} onClick={onClose} type="button">Annulla</button><button className="client-action client-action--primary" disabled={isSaving} type="submit"><Check size={16} />{isSaving ? 'Salvataggio…' : promo ? 'Salva modifiche' : 'Crea promo'}</button></footer>
    </form>
  </section></div>;
}
