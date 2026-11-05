'use client';

import {useMemo, useState, type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {Check, ChevronUp, Columns3, CornerDownRight, LayoutList, Lightbulb, Monitor, Package, Plus, Search, Sparkles, X} from 'lucide-react';

import {FEEDBACK_CATEGORIES, type FeedbackCategory} from '@/lib/feedback-categories';

export type FeedbackItem = {
  id: string;
  title: string;
  description: string;
  category: string;
  status: 'new' | 'evaluating' | 'implementing' | 'completed' | 'rejected';
  publicResponse: string;
  authorName: string;
  votes: number;
  voted: boolean;
  createdAt: string;
  updatedAt: string;
};

const statusLabels: Record<FeedbackItem['status'], string> = {new: 'Nuova', evaluating: 'In valutazione', implementing: 'In implementazione', completed: 'Completata', rejected: 'Rifiutata'};
const categoryIcons: Record<string, typeof Package> = {'Nuovo prodotto': Package, 'Sito web': Monitor, WOWPRO: Sparkles, 'Funzionalità': Lightbulb};
const categoryFilters: Array<{label: string; value: string}> = [{label: 'Prodotti', value: 'Nuovo prodotto'}, {label: 'Sito web', value: 'Sito web'}, {label: 'WOWPRO', value: 'WOWPRO'}, {label: 'Funzioni', value: 'Funzionalità'}];
const roadmapColumns: Array<FeedbackItem['status']> = ['evaluating', 'implementing', 'completed'];

export function ClientFeedbackBoard({initialItems, now}: {initialItems: FeedbackItem[]; now: number}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [view, setView] = useState<'board' | 'roadmap'>('board');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'votes' | 'recent'>('votes');
  const [isProposing, setIsProposing] = useState(false);
  const [voting, setVoting] = useState<string | null>(null);

  const stats = useMemo(() => ({
    open: items.filter((item) => item.status === 'new' || item.status === 'evaluating').length,
    implementing: items.filter((item) => item.status === 'implementing').length,
    released: items.filter((item) => item.status === 'completed').length,
    myVotes: items.filter((item) => item.voted).length,
  }), [items]);

  const term = query.trim().toLocaleLowerCase('it-IT');
  const visible = items
    .filter((item) => (category === 'all' || item.category === category) && (!term || `${item.title} ${item.description}`.toLocaleLowerCase('it-IT').includes(term)))
    .sort((a, b) => sort === 'votes' ? b.votes - a.votes || b.createdAt.localeCompare(a.createdAt) : b.createdAt.localeCompare(a.createdAt));

  async function vote(item: FeedbackItem) {
    if (voting) return;
    setVoting(item.id);
    // Optimistic update, reverted if the server refuses.
    setItems((current) => current.map((entry) => entry.id === item.id ? {...entry, voted: !entry.voted, votes: entry.votes + (entry.voted ? -1 : 1)} : entry));
    try {
      const response = await fetch(`/api/client/feedback/${item.id}/vote`, {method: 'POST'});
      const result = await response.json() as {voted?: boolean; votes?: number};
      if (!response.ok || result.voted === undefined) throw new Error();
      setItems((current) => current.map((entry) => entry.id === item.id ? {...entry, voted: Boolean(result.voted), votes: result.votes ?? entry.votes} : entry));
    } catch {
      setItems((current) => current.map((entry) => entry.id === item.id ? {...entry, voted: item.voted, votes: item.votes} : entry));
    } finally { setVoting(null); }
  }

  return <section className="feedback-portal">
    <header className="feedback-hero">
      <div>
        <span className="feedback-hero__eyebrow"><i /> BACHECA CONDIVISA · CLIENTI WOWSTAMPA</span>
        <h2>Aiutaci a costruire la <em>prossima WowStampa</em></h2>
        <p>Raccontaci cosa miglioreresti del portale, del sito e del programma WOWPRO, o suggerisci un nuovo prodotto da stampare. Le idee più votate dai clienti diventano la nostra priorità. Trovi una proposta che ti convince? Votala invece di duplicarla.</p>
        <div className="feedback-hero__actions">
          <button className="button button--primary" onClick={() => setIsProposing(true)} type="button"><Plus size={17} /> Proponi una richiesta</button>
          <button className="button feedback-hero__ghost" onClick={() => setView('roadmap')} type="button">Guarda la roadmap</button>
        </div>
      </div>
      <div className="feedback-hero__stats">
        <Stat label="Richieste aperte" value={stats.open} />
        <Stat label="In implementazione" value={stats.implementing} />
        <Stat label="Già rilasciate" value={stats.released} />
        <Stat label="I tuoi voti" value={stats.myVotes} />
      </div>
    </header>

    <div className="feedback-tabs" role="tablist">
      <button aria-selected={view === 'board'} className={view === 'board' ? 'is-active' : ''} onClick={() => setView('board')} role="tab" type="button"><LayoutList size={15} /> Bacheca</button>
      <button aria-selected={view === 'roadmap'} className={view === 'roadmap' ? 'is-active' : ''} onClick={() => setView('roadmap')} role="tab" type="button"><Columns3 size={15} /> Roadmap</button>
    </div>

    {view === 'board' ? <>
      <div className="feedback-filters">
        <div className="feedback-chips">
          <button className={category === 'all' ? 'is-active' : ''} onClick={() => setCategory('all')} type="button">Tutte <b>{items.length}</b></button>
          {categoryFilters.map((filter) => { const Icon = categoryIcons[filter.value]; return <button className={category === filter.value ? 'is-active' : ''} key={filter.value} onClick={() => setCategory(filter.value)} type="button"><Icon size={14} />{filter.label} <b>{items.filter((item) => item.category === filter.value).length}</b></button>; })}
        </div>
        <div className="feedback-filters__right">
          <label className="client-search"><Search size={16} /><input onChange={(event) => setQuery(event.target.value)} placeholder="Cerca tra le richieste..." value={query} /></label>
          <label className="feedback-sort">Ordina<select onChange={(event) => setSort(event.target.value as 'votes' | 'recent')} value={sort}><option value="votes">Più votate</option><option value="recent">Più recenti</option></select></label>
        </div>
      </div>
      <div className="feedback-list">
        {visible.map((item) => <FeedbackCard isVoting={voting === item.id} item={item} key={item.id} now={now} onVote={() => vote(item)} />)}
        {!visible.length ? <div className="feedback-empty"><Search size={22} /><p>{items.length ? 'Nessuna richiesta corrisponde ai filtri.' : 'Nessuna proposta per ora.'}</p><small>{items.length ? 'Prova a cambiare categoria o proponi una nuova idea.' : 'Sii il primo a suggerire un miglioramento!'}</small></div> : null}
      </div>
    </> : <div className="feedback-roadmap">
      {roadmapColumns.map((status) => {
        const column = items.filter((item) => item.status === status).sort((a, b) => b.votes - a.votes);
        return <section className={`feedback-roadmap__col feedback-roadmap__col--${status}`} key={status}>
          <header><span className={`feedback-pill feedback-pill--${status}`}>{statusLabels[status]}</span><b>{column.length}</b></header>
          {column.map((item) => <article key={item.id}><CategoryTag category={item.category} /><strong>{item.title}</strong><small><ChevronUp size={13} /> {item.votes} voti</small></article>)}
          {!column.length ? <p>Nessuna richiesta in questa fase.</p> : null}
        </section>;
      })}
    </div>}

    {isProposing ? <ProposeModal items={items} onClose={() => setIsProposing(false)} onCreated={() => { setIsProposing(false); router.refresh(); }} onVote={(item) => { void vote(item); }} /> : null}
  </section>;
}

function Stat({label, value}: {label: string; value: number}) { return <div><strong>{value}</strong><small>{label}</small></div>; }

function CategoryTag({category}: {category: string}) {
  const Icon = categoryIcons[category] || Lightbulb;
  return <span className={`feedback-tag feedback-tag--${slug(category)}`}><Icon size={12} />{category}</span>;
}

function FeedbackCard({isVoting, item, now, onVote}: {isVoting: boolean; item: FeedbackItem; now: number; onVote: () => void}) {
  return <article className="feedback-card">
    <button aria-label={item.voted ? 'Rimuovi voto' : 'Vota questa richiesta'} aria-pressed={item.voted} className={item.voted ? 'feedback-vote is-voted' : 'feedback-vote'} disabled={isVoting} onClick={onVote} type="button"><ChevronUp size={18} /><strong>{item.votes}</strong><small>voti</small></button>
    <div className="feedback-card__body">
      <CategoryTag category={item.category} />
      <h3>{item.title}</h3>
      <p>{item.description}</p>
      <div className="feedback-card__meta"><span className="feedback-card__avatar">{initials(item.authorName)}</span>{item.authorName}<i />{item.status === 'completed' ? `completata · ${relative(item.updatedAt, now)}` : relative(item.createdAt, now)}</div>
      {item.publicResponse ? <div className="feedback-card__response"><CornerDownRight size={14} /><b>Risposta WowStampa</b> · {item.publicResponse}</div> : null}
    </div>
    <span className={`feedback-pill feedback-pill--${item.status}`}>{statusLabels[item.status]}</span>
  </article>;
}

function ProposeModal({items, onClose, onCreated, onVote}: {items: FeedbackItem[]; onClose: () => void; onCreated: () => void; onVote: (item: FeedbackItem) => void}) {
  const [category, setCategory] = useState<FeedbackCategory>('WOWPRO');
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const words = title.toLocaleLowerCase('it-IT').split(/\W+/).filter((word) => word.length > 3);
  const similar = words.length ? items.filter((item) => item.status !== 'rejected' && words.some((word) => item.title.toLocaleLowerCase('it-IT').includes(word))).slice(0, 3) : [];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setIsSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/client/feedback', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({category, title: String(form.get('title') || ''), description: String(form.get('description') || '')})});
      const result = await response.json() as {error?: string};
      if (!response.ok) throw new Error(result.error || 'Proposta non inviata.');
      onCreated();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Proposta non inviata.'); } finally { setIsSaving(false); }
  }

  return <div aria-modal="true" className="modal-backdrop" role="dialog"><section className="client-modal"><header><div><h2>Proponi una richiesta</h2><p>La tua idea sarà visibile agli altri clienti WOWPRO, che potranno votarla.</p></div><button aria-label="Chiudi" className="modal-close" onClick={onClose} type="button"><X size={19} /></button></header>
    <form className="client-form" onSubmit={submit}>
      <fieldset className="feedback-category-picker client-form__wide"><legend>Categoria</legend>{FEEDBACK_CATEGORIES.map((value) => { const Icon = categoryIcons[value]; return <button className={category === value ? 'is-selected' : ''} key={value} onClick={() => setCategory(value)} type="button"><Icon size={15} />{value}</button>; })}</fieldset>
      <label className="client-form__wide">Titolo<input maxLength={120} minLength={5} name="title" onChange={(event) => setTitle(event.target.value)} placeholder="Es. Stampa su tazze personalizzate" required value={title} /></label>
      {similar.length ? <div className="feedback-similar client-form__wide"><small>Proposte simili già presenti: se una ti convince, votala.</small>{similar.map((item) => <div key={item.id}><span>{item.title}</span><button className={item.voted ? 'is-voted' : ''} onClick={() => onVote(item)} type="button">{item.voted ? <><Check size={13} /> Votata</> : <><ChevronUp size={13} /> Vota</>}</button></div>)}</div> : null}
      <label className="client-form__wide">Descrizione<textarea maxLength={2000} minLength={10} name="description" placeholder="Spiega cosa ti servirebbe e perché sarebbe utile..." required rows={5} /></label>
      {error ? <p className="form-error">{error}</p> : null}
      <footer className="modal-actions"><button className="client-action" disabled={isSaving} onClick={onClose} type="button">Annulla</button><button className="client-action client-action--primary" disabled={isSaving} type="submit"><Plus size={16} />{isSaving ? 'Invio...' : 'Pubblica proposta'}</button></footer>
    </form>
  </section></div>;
}

function slug(value: string) { return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, '-'); }
function initials(value: string) { return value.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
function relative(value: string, now: number) {
  const days = Math.floor((now - new Date(value).getTime()) / 86_400_000);
  if (days < 1) return 'oggi';
  if (days === 1) return 'ieri';
  if (days < 7) return `${days} giorni fa`;
  if (days < 30) { const weeks = Math.floor(days / 7); return weeks === 1 ? '1 settimana fa' : `${weeks} settimane fa`; }
  const months = Math.floor(days / 30);
  return months === 1 ? '1 mese fa' : `${months} mesi fa`;
}
