'use client';

import {useRef, useState, type ChangeEvent} from 'react';
import {Download, FileText, Paperclip, Upload} from 'lucide-react';

export type RequestFileItem = {id: string; name: string; size: number; createdAt: string};

export const ACCEPTED_FILES = '.pdf,.ai,.eps,.svg,.psd,.jpg,.jpeg,.png,.tif,.tiff,.zip';
export const ACCEPTED_LABEL = 'PDF, AI, EPS, SVG, PSD, JPG, PNG, TIFF, ZIP · max 50 MB';
const MAX_BYTES = 50 * 1024 * 1024;

export function validateFiles(files: File[]) {
  const allowed = ACCEPTED_FILES.split(',').map((item) => item.slice(1));
  const tooBig = files.find((file) => file.size > MAX_BYTES);
  if (tooBig) return `${tooBig.name} supera il limite di 50 MB.`;
  const wrong = files.find((file) => !allowed.includes((file.name.split('.').pop() || '').toLowerCase()));
  if (wrong) return `${wrong.name}: formato non consentito.`;
  return '';
}

// Uploads each file straight to Supabase Storage through a signed URL, reporting overall progress (0–1).
export async function uploadRequestFiles(requestId: string, files: File[], onProgress: (ratio: number) => void) {
  const total = files.reduce((sum, file) => sum + file.size, 0) || 1;
  let done = 0;
  const uploaded: RequestFileItem[] = [];
  const failed: string[] = [];
  for (const file of files) {
    try {
      const ticket = await postJson<{uploadUrl: string; path: string}>(`/api/requests/${requestId}/files`, {fileName: file.name, size: file.size});
      await putWithProgress(ticket.uploadUrl, file, (loaded) => onProgress(Math.min((done + loaded) / total, 1)));
      const confirmed = await postJson<{file: RequestFileItem}>(`/api/requests/${requestId}/files/confirm`, {path: ticket.path, fileName: file.name, size: file.size, mimeType: file.type || undefined});
      uploaded.push(confirmed.file);
    } catch {
      failed.push(file.name);
    }
    done += file.size;
    onProgress(Math.min(done / total, 1));
  }
  return {uploaded, failed};
}

function putWithProgress(url: string, file: File, onLoaded: (bytes: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('x-upsert', 'false');
    const apiKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (apiKey) xhr.setRequestHeader('apikey', apiKey);
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onLoaded(event.loaded); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload ${xhr.status}`)));
    xhr.onerror = () => reject(new Error('Upload non riuscito'));
    const body = new FormData();
    body.append('cacheControl', '3600');
    body.append('', file);
    xhr.send(body);
  });
}

async function postJson<T>(url: string, payload: unknown) {
  const response = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
  const result = await response.json().catch(() => ({})) as T & {error?: string};
  if (!response.ok) throw new Error(result.error || 'Operazione non riuscita.');
  return result;
}

export function FileList({files, compact = false}: {files: RequestFileItem[]; compact?: boolean}) {
  if (!files.length) return null;
  return <ul className={compact ? 'file-list file-list--compact' : 'file-list'}>{files.map((file) => <li key={file.id}>
    <FileText size={compact ? 14 : 16} />
    <a href={`/api/files/${file.id}`} rel="noreferrer" target="_blank" title={`Scarica ${file.name}`}>{file.name}</a>
    <small>{formatBytes(file.size)}</small>
    {compact ? null : <a aria-label={`Scarica ${file.name}`} className="file-list__download" href={`/api/files/${file.id}`} rel="noreferrer" target="_blank"><Download size={15} /></a>}
  </li>)}</ul>;
}

export function AddFilesButton({requestId, onUploaded}: {requestId: string; onUploaded: (files: RequestFileItem[]) => void}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  async function select(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    const invalid = validateFiles(files);
    if (invalid) { setMessage(invalid); return; }
    setMessage(''); setProgress(0);
    const {uploaded, failed} = await uploadRequestFiles(requestId, files, setProgress);
    setProgress(null);
    if (uploaded.length) onUploaded(uploaded);
    if (failed.length) setMessage(`Non caricati: ${failed.join(', ')}. Riprova.`);
  }

  return <div className="add-files">
    <input accept={ACCEPTED_FILES} hidden multiple onChange={select} ref={inputRef} type="file" />
    <button className="client-action" disabled={progress !== null} onClick={() => inputRef.current?.click()} type="button">{progress !== null ? <Upload size={15} /> : <Paperclip size={15} />}{progress !== null ? `Caricamento ${Math.round(progress * 100)}%` : 'Aggiungi file'}</button>
    {progress !== null ? <span className="upload-progress"><i style={{width: `${Math.round(progress * 100)}%`}} /></span> : null}
    {message ? <p className="form-error">{message}</p> : null}
  </div>;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toLocaleString('it-IT', {maximumFractionDigits: 1})} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toLocaleString('it-IT', {maximumFractionDigits: 2})} GB`;
}
