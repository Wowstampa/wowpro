'use client';

import {useEffect, useState} from 'react';
import {Search} from 'lucide-react';

import {SupportChat} from '@/components/support-chat';

export type InboxConversation = {companyId: string; companyName: string; accountManager: string; lastMessage: string; lastAt: string | null; unread: number};

export function AdminInbox({initialConversations, initialCompanyId}: {initialConversations: InboxConversation[]; initialCompanyId?: string}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [selected, setSelected] = useState(initialCompanyId || initialConversations.find((item) => item.lastAt)?.companyId || initialConversations[0]?.companyId || '');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const timer = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const response = await fetch('/api/support/conversations', {cache: 'no-store'});
        if (response.ok) setConversations(((await response.json()) as {conversations: InboxConversation[]}).conversations);
      } catch { /* Keep the current list until the next refresh. */ }
    }, 10_000);
    return () => clearInterval(timer);
  }, []);

  const term = query.trim().toLocaleLowerCase('it-IT');
  const visible = conversations.filter((item) => !term || item.companyName.toLocaleLowerCase('it-IT').includes(term));

  if (!conversations.length) return <section className="empty-card empty-card--section"><span className="eyebrow">NESSUNA CONVERSAZIONE</span><h2>Non ci sono clienti assegnati a te</h2><p>Collega un cliente al suo account manager da Clienti → Modifica.</p></section>;

  return <section className="inbox">
    <aside className="inbox__list">
      <label className="client-search"><Search size={16} /><input onChange={(event) => setQuery(event.target.value)} placeholder="Cerca cliente…" value={query} /></label>
      <div>{visible.map((item) => <button aria-pressed={selected === item.companyId} className={selected === item.companyId ? 'inbox__item is-selected' : 'inbox__item'} key={item.companyId} onClick={() => { setSelected(item.companyId); setConversations((current) => current.map((conversation) => conversation.companyId === item.companyId ? {...conversation, unread: 0} : conversation)); }} type="button">
        <span className="inbox__avatar">{item.companyName.slice(0, 1).toUpperCase()}</span>
        <span className="inbox__copy"><strong>{item.companyName}</strong><small>{item.lastMessage || `Account manager: ${item.accountManager}`}</small></span>
        <span className="inbox__meta">{item.lastAt ? <small>{shortDate(item.lastAt)}</small> : null}{item.unread ? <b>{item.unread}</b> : null}</span>
      </button>)}</div>
    </aside>
    <div className="inbox__chat">{selected ? <SupportChat companyId={selected} emptyHint="Nessun messaggio con questo cliente. Puoi scrivergli per primo." key={selected} viewer="team" /> : null}</div>
  </section>;
}

function shortDate(value: string) {
  const date = new Date(value);
  return date.toDateString() === new Date().toDateString()
    ? new Intl.DateTimeFormat('it-IT', {hour: '2-digit', minute: '2-digit'}).format(date)
    : new Intl.DateTimeFormat('it-IT', {day: 'numeric', month: 'short'}).format(date);
}
