'use client';

import {AlertTriangle, CheckCircle2, Zap} from 'lucide-react';
import {useCallback, useEffect, useRef, useState, type ReactNode} from 'react';
import {createPortal} from 'react-dom';

type Tone = 'default' | 'danger' | 'express';
type Options = {title: string; message: ReactNode; confirmLabel: string; cancelLabel?: string; tone?: Tone; input?: {label: string; defaultValue?: string; placeholder?: string}};
type Pending = Options & {resolve: (value: string | null) => void};

const ICONS: Record<Tone, ReactNode> = {default: <CheckCircle2 size={22} />, danger: <AlertTriangle size={22} />, express: <Zap size={22} />};

// In-app replacement for window.confirm / window.prompt: resolves with the typed text ('' without input) or null when cancelled.
export function useConfirm(): [ReactNode, (options: Options) => Promise<string | null>] {
  const [pending, setPending] = useState<Pending | null>(null);
  const [value, setValue] = useState('');
  const confirmButton = useRef<HTMLButtonElement>(null);

  const ask = useCallback((options: Options) => new Promise<string | null>((resolve) => { setValue(options.input?.defaultValue || ''); setPending({...options, resolve}); }), []);
  const close = useCallback((result: string | null) => { setPending((current) => { current?.resolve(result); return null; }); }, []);

  useEffect(() => {
    if (!pending) return;
    if (!pending.input) confirmButton.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, close]);

  const tone = pending?.tone || 'default';
  const ui = pending && typeof document !== 'undefined' ? createPortal(<div aria-modal="true" className="modal-backdrop confirm-backdrop" onClick={(event) => { if (event.target === event.currentTarget) close(null); }} role="alertdialog">
    <section className={`confirm-dialog confirm-dialog--${tone}`}>
      <span className="confirm-dialog__icon">{ICONS[tone]}</span>
      <h3>{pending.title}</h3>
      <div className="confirm-dialog__message">{pending.message}</div>
      {pending.input ? <label className="confirm-dialog__field"><span>{pending.input.label}</span><textarea autoFocus maxLength={500} onChange={(event) => setValue(event.target.value)} placeholder={pending.input.placeholder} rows={3} value={value} /></label> : null}
      <footer>
        <button className="client-action" onClick={() => close(null)} type="button">{pending.cancelLabel || 'Annulla'}</button>
        <button className={`client-action ${tone === 'danger' ? 'client-action--danger-solid' : 'client-action--primary'}`} onClick={() => close(pending.input ? value.trim() : '')} ref={confirmButton} type="button">{pending.confirmLabel}</button>
      </footer>
    </section>
  </div>, document.body) : null;

  return [ui, ask];
}
