'use client';

import {useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent} from 'react';
import {useRouter} from 'next/navigation';
import {CheckCheck, FileText, Loader2, MessageCircle, Paperclip, Send, X} from 'lucide-react';

import {ACCEPTED_FILES, formatBytes, putWithProgress, validateFiles} from '@/components/request-files';

type Message = {id: string; body: string; createdAt: string; authorName: string; fromClient: boolean; file: {name: string; size: number} | null};
type Conversation = {messages: Message[]; teamReadAt: string | null; clientReadAt: string | null; companyName: string; manager: string | null};

const POLL_MS = 5_000;

export function SupportChat({companyId, viewer, emptyHint}: {companyId?: string; viewer: 'client' | 'team'; emptyHint?: string}) {
  const router = useRouter();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [error, setError] = useState('');
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [isSending, setIsSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastCount = useRef(0);
  const query = companyId ? `?companyId=${companyId}` : '';

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/support/messages${query}`, {cache: 'no-store'});
      const result = await response.json() as Conversation & {error?: string};
      if (!response.ok) throw new Error(result.error || 'Messaggi non disponibili.');
      setConversation(result); setError('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Messaggi non disponibili.'); }
  }, [query]);

  useEffect(() => {
    lastCount.current = 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the view when switching conversation
    setConversation(null);
    void load();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const count = conversation?.messages.length || 0;
    if (count !== lastCount.current) {
      if (lastCount.current === 0 || count > lastCount.current) listRef.current?.scrollTo({top: listRef.current.scrollHeight, behavior: lastCount.current ? 'smooth' : 'auto'});
      if (lastCount.current && count > lastCount.current) router.refresh();
      lastCount.current = count;
    }
  }, [conversation, router]);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const text = body.trim();
    if ((!text && !file) || isSending) return;
    setIsSending(true); setError('');
    try {
      let attachment: {path: string; name: string; size: number} | undefined;
      if (file) {
        const ticket = await postJson<{uploadUrl: string; path: string}>('/api/support/files', {companyId, fileName: file.name, size: file.size});
        setProgress(0);
        await putWithProgress(ticket.uploadUrl, file, (loaded) => setProgress(loaded / (file.size || 1)));
        attachment = {path: ticket.path, name: file.name, size: file.size};
      }
      const result = await postJson<{message: Message}>('/api/support/messages', {companyId, body: text, file: attachment});
      setConversation((current) => current ? {...current, messages: [...current.messages, result.message]} : current);
      setBody(''); setFile(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Messaggio non inviato.');
    } finally { setIsSending(false); setProgress(null); }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); }
  }

  function pickFile(files: FileList | null) {
    const picked = files?.[0];
    if (!picked) return;
    const invalid = validateFiles([picked]);
    if (invalid) { setError(invalid); return; }
    setError(''); setFile(picked);
  }

  const otherReadAt = viewer === 'client' ? conversation?.teamReadAt : conversation?.clientReadAt;
  const mine = (message: Message) => (viewer === 'client' ? message.fromClient : !message.fromClient);
  const lastMine = [...(conversation?.messages || [])].reverse().find(mine);

  return <section className="support-chat">
    <header className="support-chat__head">
      <span className="support-chat__avatar">{initials(viewer === 'client' ? conversation?.manager || 'WowStampa' : conversation?.companyName || '…')}</span>
      <div>
        <strong>{viewer === 'client' ? conversation?.manager || 'Team WowStampa' : conversation?.companyName || 'Caricamento…'}</strong>
        <small>{viewer === 'client' ? 'Il tuo account manager WowStampa' : conversation?.manager ? `Account manager: ${conversation.manager}` : 'Account manager non assegnato'}</small>
      </div>
    </header>

    <div className="support-chat__messages" ref={listRef}>
      {!conversation && !error ? <p className="support-chat__loading"><Loader2 className="spin" size={18} /> Caricamento messaggi…</p> : null}
      {conversation && !conversation.messages.length ? <div className="support-chat__empty"><MessageCircle size={26} /><p>{emptyHint || 'Nessun messaggio. Scrivi qui sotto per iniziare la conversazione.'}</p></div> : null}
      {conversation?.messages.map((message, index) => {
        const previous = conversation.messages[index - 1];
        const showDay = !previous || dayKey(previous.createdAt) !== dayKey(message.createdAt);
        const isMine = mine(message);
        return <div key={message.id}>
          {showDay ? <p className="support-chat__day">{dayLabel(message.createdAt)}</p> : null}
          <article className={isMine ? 'support-msg support-msg--mine' : 'support-msg'}>
            {!isMine && (!previous || mine(previous) || showDay) ? <small className="support-msg__author">{message.authorName}</small> : null}
            {message.body ? <p>{message.body}</p> : null}
            {message.file ? <a className="support-msg__file" href={`/api/support/files/${message.id}`} rel="noreferrer" target="_blank"><FileText size={16} /><span>{message.file.name}</span><small>{formatBytes(message.file.size)}</small></a> : null}
            <time>{time(message.createdAt)}{isMine && message.id === lastMine?.id && otherReadAt && otherReadAt >= message.createdAt ? <span className="support-msg__read"><CheckCheck size={13} /> Letto</span> : null}</time>
          </article>
        </div>;
      })}
    </div>

    <form className="support-chat__composer" onSubmit={send}>
      {file ? <div className="support-chat__attachment"><FileText size={15} /><span>{file.name}</span><small>{formatBytes(file.size)}</small>{progress !== null ? <span className="upload-progress"><i style={{width: `${Math.round(progress * 100)}%`}} /></span> : <button aria-label="Rimuovi allegato" onClick={() => setFile(null)} type="button"><X size={14} /></button>}</div> : null}
      {error ? <p className="form-error">{error}</p> : null}
      <div className="support-chat__input">
        <input accept={ACCEPTED_FILES} hidden onChange={(event) => { pickFile(event.target.files); event.target.value = ''; }} ref={fileRef} type="file" />
        <button aria-label="Allega file" className="support-chat__icon" disabled={isSending} onClick={() => fileRef.current?.click()} type="button"><Paperclip size={18} /></button>
        <textarea maxLength={4000} onChange={(event) => setBody(event.target.value)} onKeyDown={onKeyDown} placeholder="Scrivi un messaggio…" rows={1} value={body} />
        <button aria-label="Invia" className="support-chat__send" disabled={isSending || (!body.trim() && !file)} type="submit">{isSending ? <Loader2 className="spin" size={18} /> : <Send size={18} />}</button>
      </div>
      <small className="support-chat__hint">Invio per inviare · Maiusc+Invio per andare a capo</small>
    </form>
  </section>;
}

async function postJson<T>(url: string, payload: unknown) {
  const response = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
  const result = await response.json().catch(() => ({})) as T & {error?: string};
  if (!response.ok) throw new Error(result.error || 'Operazione non riuscita.');
  return result;
}

function initials(value: string) { return value.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'W'; }
function dayKey(value: string) { return new Date(value).toDateString(); }
function time(value: string) { return new Intl.DateTimeFormat('it-IT', {hour: '2-digit', minute: '2-digit'}).format(new Date(value)); }
function dayLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Oggi';
  if (date.toDateString() === yesterday.toDateString()) return 'Ieri';
  return new Intl.DateTimeFormat('it-IT', {weekday: 'long', day: 'numeric', month: 'long'}).format(date);
}
