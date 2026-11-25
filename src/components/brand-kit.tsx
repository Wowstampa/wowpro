'use client';

/* eslint-disable @next/next/no-img-element -- brand files are served through signed redirects */
import {Check, Download, FileText, Image as ImageIcon, Loader2, Palette, Plus, Trash2, Type, Upload, X} from 'lucide-react';
import {useCallback, useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';

import {useConfirm} from '@/components/confirm-dialog';
import {formatBytes, putWithProgress} from '@/components/request-files';

type BrandFileView = {id: string; name: string; size: number; kind: 'logo' | 'file'; uploadedAt: string; previewable: boolean};
export type BrandKitData = {colors: Array<{name: string; hex: string}>; fonts: Array<{name: string; usage: string}>; notes: string; website: string; files: BrandFileView[]; updatedAt: string | null};

const ACCEPT = '.pdf,.ai,.eps,.svg,.psd,.jpg,.jpeg,.png,.webp,.tif,.tiff,.zip,.otf,.ttf,.woff,.woff2';
const LOGO_ACCEPT = '.svg,.png,.jpg,.jpeg,.webp,.pdf,.ai,.eps';
const MAX_BYTES = 50 * 1024 * 1024;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {...init, headers: {'Content-Type': 'application/json', ...(init?.headers || {})}});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as {error?: string}).error || 'Operazione non riuscita.');
  return data as T;
}

// Logos, colours, fonts, notes and files: filled once by the client (or the team), used by designers in every request.
export function BrandKitEditor({initial, canEdit, companyId, compact = false}: {initial: BrandKitData; canEdit: boolean; companyId?: string; compact?: boolean}) {
  const [kit, setKit] = useState(initial);
  const [colors, setColors] = useState(initial.colors);
  const [fonts, setFonts] = useState(initial.fonts);
  const [notes, setNotes] = useState(initial.notes);
  const [website, setWebsite] = useState(initial.website);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState<string>('');
  const [error, setError] = useState('');
  const [confirmUi, ask] = useConfirm();
  const logoInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const query = companyId ? `?companyId=${companyId}` : '';
  const fileUrl = (id: string, download = false) => `/api/brand-kit/files/${id}${query}${download ? `${query ? '&' : '?'}download` : ''}`;
  const dirty = JSON.stringify({colors, fonts, notes, website}) !== JSON.stringify({colors: kit.colors, fonts: kit.fonts, notes: kit.notes, website: kit.website});

  async function save() {
    setSaving(true); setError('');
    try {
      const result = await api<{kit: BrandKitData}>('/api/brand-kit', {method: 'PUT', body: JSON.stringify({companyId, colors: colors.filter((color) => /^#[0-9a-f]{6}$/i.test(color.hex)), fonts: fonts.filter((font) => font.name.trim()), notes, website})});
      setKit(result.kit); setColors(result.kit.colors); setFonts(result.kit.fonts); setSaved(true); setTimeout(() => setSaved(false), 2200);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Brand kit non salvato.'); } finally { setSaving(false); }
  }

  async function upload(files: FileList | null, kind: 'logo' | 'file') {
    if (!files?.length) return;
    setError('');
    for (const [index, file] of [...files].entries()) {
      if (file.size > MAX_BYTES) { setError(`${file.name}: supera il limite di 50 MB.`); continue; }
      try {
        setUploading(`Caricamento ${index + 1} di ${files.length}: ${file.name}`);
        const ticket = await api<{uploadUrl: string; fileId: string}>('/api/brand-kit/files', {method: 'POST', body: JSON.stringify({step: 'start', companyId, fileName: file.name, size: file.size})});
        await putWithProgress(ticket.uploadUrl, file, () => undefined);
        const result = await api<{kit: BrandKitData}>('/api/brand-kit/files', {method: 'POST', body: JSON.stringify({step: 'finish', companyId, fileId: ticket.fileId, fileName: file.name, size: file.size, kind})});
        setKit(result.kit);
      } catch (caught) { setError(caught instanceof Error ? caught.message : `${file.name}: caricamento non riuscito.`); }
    }
    setUploading('');
  }

  async function remove(file: BrandFileView) {
    if ((await ask({title: 'Eliminare il file?', message: `${file.name} verrà tolto dal brand kit.`, confirmLabel: 'Elimina', tone: 'danger'})) === null) return;
    try { setKit((await api<{kit: BrandKitData}>(fileUrl(file.id), {method: 'DELETE'})).kit); } catch (caught) { setError(caught instanceof Error ? caught.message : 'File non eliminato.'); }
  }

  const logos = kit.files.filter((file) => file.kind === 'logo');
  const others = kit.files.filter((file) => file.kind === 'file');

  return <div className={`bk${compact ? ' bk--compact' : ''}`}>{confirmUi}
    <section className="bk-card bk-card--logos">
      <header><span className="bk-card__icon"><ImageIcon size={18} /></span><div><h3>Logo</h3><p>Le versioni del tuo logo: a colori, monocromatico, in negativo. Meglio se vettoriali (SVG, AI, EPS, PDF).</p></div>
        {canEdit ? <button className="button button--ghost bk-add" disabled={Boolean(uploading)} onClick={() => logoInput.current?.click()} type="button"><Upload size={15} /> Carica logo</button> : null}</header>
      <input accept={LOGO_ACCEPT} hidden multiple onChange={(event) => { void upload(event.target.files, 'logo'); event.target.value = ''; }} ref={logoInput} type="file" />
      {logos.length ? <ul className="bk-logos">{logos.map((file) => <li key={file.id}>
        <a className="bk-logo__preview" href={fileUrl(file.id)} rel="noreferrer" target="_blank">{file.previewable ? <img alt={file.name} loading="lazy" src={fileUrl(file.id)} /> : <span><FileText size={26} /><b>{file.name.split('.').pop()?.toUpperCase()}</b></span>}</a>
        <div><strong title={file.name}>{file.name}</strong><small>{formatBytes(file.size)}</small></div>
        <span className="bk-file__actions"><a aria-label="Scarica" href={fileUrl(file.id, true)}><Download size={15} /></a>{canEdit ? <button aria-label="Elimina" onClick={() => void remove(file)} type="button"><Trash2 size={15} /></button> : null}</span>
      </li>)}</ul> : <button className="bk-empty" disabled={!canEdit || Boolean(uploading)} onClick={() => logoInput.current?.click()} type="button"><ImageIcon size={22} /><strong>{canEdit ? 'Carica il tuo logo' : 'Nessun logo caricato'}</strong>{canEdit ? <small>Trascina qui o scegli i file · max 50 MB</small> : null}</button>}
    </section>

    <div className="bk-grid">
      <section className="bk-card">
        <header><span className="bk-card__icon"><Palette size={18} /></span><div><h3>Colori</h3><p>I colori del marchio con il codice HEX.</p></div></header>
        <ul className="bk-colors">{colors.map((color, index) => <li key={index}>
          <label className="bk-swatch" style={{background: /^#[0-9a-f]{6}$/i.test(color.hex) ? color.hex : '#ffffff'}}>{canEdit ? <input aria-label="Scegli colore" onChange={(event) => setColors((current) => current.map((item, position) => position === index ? {...item, hex: event.target.value.toUpperCase()} : item))} type="color" value={/^#[0-9a-f]{6}$/i.test(color.hex) ? color.hex : '#ffffff'} /> : null}</label>
          {canEdit ? <><input aria-label="Nome colore" className="bk-input" maxLength={60} onChange={(event) => setColors((current) => current.map((item, position) => position === index ? {...item, name: event.target.value} : item))} placeholder="Es. Verde principale" value={color.name} /><input aria-label="Codice HEX" className="bk-input bk-input--hex" maxLength={7} onChange={(event) => setColors((current) => current.map((item, position) => position === index ? {...item, hex: event.target.value.startsWith('#') ? event.target.value : `#${event.target.value}`} : item))} value={color.hex} /><button aria-label="Rimuovi colore" className="bk-remove" onClick={() => setColors((current) => current.filter((_, position) => position !== index))} type="button"><X size={14} /></button></>
            : <div><strong>{color.name || 'Colore'}</strong><small>{color.hex}</small></div>}
        </li>)}</ul>
        {canEdit && colors.length < 16 ? <button className="bk-more" onClick={() => setColors((current) => [...current, {name: '', hex: '#0E9345'}])} type="button"><Plus size={14} /> Aggiungi colore</button> : null}
        {!canEdit && !colors.length ? <p className="bk-none">Nessun colore indicato.</p> : null}
      </section>

      <section className="bk-card">
        <header><span className="bk-card__icon"><Type size={18} /></span><div><h3>Font</h3><p>I caratteri tipografici e dove li usi.</p></div></header>
        <ul className="bk-fonts">{fonts.map((font, index) => <li key={index}>
          {canEdit ? <><input aria-label="Nome font" className="bk-input" maxLength={80} onChange={(event) => setFonts((current) => current.map((item, position) => position === index ? {...item, name: event.target.value} : item))} placeholder="Es. Montserrat" value={font.name} /><input aria-label="Uso" className="bk-input" maxLength={120} onChange={(event) => setFonts((current) => current.map((item, position) => position === index ? {...item, usage: event.target.value} : item))} placeholder="Es. Titoli" value={font.usage} /><button aria-label="Rimuovi font" className="bk-remove" onClick={() => setFonts((current) => current.filter((_, position) => position !== index))} type="button"><X size={14} /></button></>
            : <div><strong style={{fontFamily: font.name}}>{font.name}</strong><small>{font.usage}</small></div>}
        </li>)}</ul>
        {canEdit && fonts.length < 10 ? <button className="bk-more" onClick={() => setFonts((current) => [...current, {name: '', usage: ''}])} type="button"><Plus size={14} /> Aggiungi font</button> : null}
        {!canEdit && !fonts.length ? <p className="bk-none">Nessun font indicato.</p> : null}
      </section>
    </div>

    <section className="bk-card">
      <header><span className="bk-card__icon"><FileText size={18} /></span><div><h3>Note per il grafico</h3><p>Tono di voce, cose da evitare, sito web e tutto quello che aiuta il team.</p></div></header>
      {canEdit ? <div className="bk-notes"><input className="bk-input" maxLength={200} onChange={(event) => setWebsite(event.target.value)} placeholder="Sito web (es. www.tuaazienda.it)" value={website} /><textarea className="bk-input" maxLength={3000} onChange={(event) => setNotes(event.target.value)} placeholder="Es. Il logo non va mai su fondi colorati, preferiamo uno stile pulito e minimal…" rows={4} value={notes} /></div>
        : <div className="bk-notes-view">{website ? <a href={/^https?:/.test(website) ? website : `https://${website}`} rel="noreferrer" target="_blank">{website}</a> : null}<p>{notes || 'Nessuna nota.'}</p></div>}
    </section>

    <section className="bk-card">
      <header><span className="bk-card__icon"><FileText size={18} /></span><div><h3>Altri file</h3><p>Manuale del marchio, font, foto, pattern, grafiche già usate.</p></div>
        {canEdit ? <button className="button button--ghost bk-add" disabled={Boolean(uploading)} onClick={() => fileInput.current?.click()} type="button"><Upload size={15} /> Carica file</button> : null}</header>
      <input accept={ACCEPT} hidden multiple onChange={(event) => { void upload(event.target.files, 'file'); event.target.value = ''; }} ref={fileInput} type="file" />
      {others.length ? <ul className="bk-files">{others.map((file) => <li key={file.id}><FileText size={18} /><div><strong title={file.name}>{file.name}</strong><small>{formatBytes(file.size)}</small></div><span className="bk-file__actions"><a aria-label="Scarica" href={fileUrl(file.id, true)}><Download size={15} /></a>{canEdit ? <button aria-label="Elimina" onClick={() => void remove(file)} type="button"><Trash2 size={15} /></button> : null}</span></li>)}</ul> : <p className="bk-none">Nessun file caricato.</p>}
    </section>

    {uploading ? <p className="bk-status"><Loader2 className="spin" size={15} /> {uploading}</p> : null}
    {error ? <p className="form-error">{error}</p> : null}
    {canEdit && (dirty || saved || saving) ? <div className={`bk-savebar${dirty ? ' is-dirty' : ''}`}><span>{dirty ? 'Hai modifiche non salvate' : saved ? 'Brand kit salvato' : 'Tutto salvato'}</span><button className="button button--primary" disabled={!dirty || saving} onClick={() => void save()} type="button">{saving ? <Loader2 className="spin" size={16} /> : saved ? <Check size={16} /> : null} Salva</button></div> : null}
  </div>;
}

// Team view: loads a client's brand kit on demand (from a request).
export function BrandKitModal({companyId, companyName, onClose}: {companyId: string; companyName: string; onClose: () => void}) {
  const [data, setData] = useState<{kit: BrandKitData; canEdit: boolean} | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { setData(await api<{kit: BrandKitData; canEdit: boolean}>(`/api/brand-kit?companyId=${companyId}`)); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Brand kit non disponibile.'); }
  }, [companyId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the kit when the modal opens
  useEffect(() => { void load(); }, [load]);
  // Portalled to <body>: the request drawer is transformed, which would trap a fixed overlay.
  return createPortal(<div aria-modal="true" className="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} role="dialog">
    <section className="bk-modal">
      <header><div><span className="buy-form__step">Brand kit</span><h3>{companyName}</h3></div><button aria-label="Chiudi" className="subscription-buy__close" onClick={onClose} type="button"><X size={18} /></button></header>
      {error ? <p className="form-error">{error}</p> : !data ? <p className="bk-status"><Loader2 className="spin" size={15} /> Caricamento…</p> : <BrandKitEditor canEdit={data.canEdit} companyId={companyId} compact initial={data.kit} />}
    </section>
  </div>, document.body);
}
