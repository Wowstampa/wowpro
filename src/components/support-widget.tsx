'use client';

import {useEffect, useState} from 'react';
import {MessageCircle, X} from 'lucide-react';

import {SupportChat} from '@/components/support-chat';

export const OPEN_CHAT_EVENT = 'wowpro:open-chat';

// Floating chat with the account manager, available on every client page.
export function SupportWidget({initialUnread, managerName}: {initialUnread: number; managerName: string | null}) {
  const [isOpen, setIsOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);

  useEffect(() => {
    const open = () => setIsOpen(true);
    window.addEventListener(OPEN_CHAT_EVENT, open);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, open);
  }, []);

  useEffect(() => {
    if (isOpen) return;
    const timer = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const response = await fetch('/api/support/unread', {cache: 'no-store'});
        if (response.ok) setUnread(((await response.json()) as {unread: number}).unread);
      } catch { /* Try again on the next tick. */ }
    }, 30_000);
    return () => clearInterval(timer);
  }, [isOpen]);

  return <div className="support-widget">
    {isOpen ? <section aria-label="Chat con il tuo account manager" className="support-widget__panel" role="dialog">
      <button aria-label="Chiudi chat" className="support-widget__close" onClick={() => setIsOpen(false)} type="button"><X size={18} /></button>
      <SupportChat emptyHint={`Scrivi a ${managerName || 'il tuo account manager'}: ti risponderà qui e riceverai un avviso via email.`} variant="popup" viewer="client" />
    </section> : null}
    <button aria-expanded={isOpen} aria-label={isOpen ? 'Chiudi chat' : 'Apri chat con il tuo account manager'} className="support-widget__launcher" onClick={() => { setIsOpen((value) => !value); setUnread(0); }} type="button">
      {isOpen ? <X size={24} /> : <MessageCircle size={24} />}
      {!isOpen && unread ? <b>{unread > 9 ? '9+' : unread}</b> : null}
    </button>
  </div>;
}

export function OpenChatButton({children, className}: {children: React.ReactNode; className?: string}) {
  return <button className={className} onClick={() => window.dispatchEvent(new Event(OPEN_CHAT_EVENT))} type="button">{children}</button>;
}
