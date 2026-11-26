'use client';

import {useMemo, useState, type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {ArrowRight, Check, CheckCircle2, ChevronUp, Columns3, Flame, Hourglass, LayoutList, Lightbulb, MessageSquareReply, Monitor, Package, Plus, Rocket, Search, Sparkles, X} from 'lucide-react';

import {PageIntro} from '@/components/page-intro';
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

const statusLabels: Record<FeedbackItem['status'], string> = {new: 'Proposta', evaluating: 'In valutazione', implementing: 'In sviluppo', completed: 'Rilasciata', rejected: 'Non in programma'};
const categoryIcons: Record<string, typeof Package> = {'Nuovo prodotto': Package, 'Sito web': Monitor, WOWPRO: Sparkles, 'Funzionalità': Lightbulb};
const categoryFilters: Array<{label: string; value: string}> = [{label: 'Prodotti', value: 'Nuovo prodotto'}, {label: 'Sito web', value: 'Sito web'}, {label: 'WOWPRO', value: 'WOWPRO'}, {label: 'Funzioni', value: 'Funzionalità'}];
const STEPS = ['Proposta', 'In valutazione', 'In sviluppo', 'Rilasciata'];
const STEP_OF: Record<FeedbackItem['status'], number> = {new: 0, evaluating: 1, implementing: 2, completed: 3, rejected: -1};
const PROMPTS: Array<{category: FeedbackCategory; title: string; text: string}> = [
  {category: 'Nuovo prodotto', title: 'Un prodotto da stampare', text: 'Che oggi non trovi su WowStampa'},
  {category: 'WOWPRO', title: 'Migliora il portale', text: 'Qualcosa che ti farebbe risparmiare tempo'},
  {category: 'Sito web', title: 'Un’idea per il sito', text: 'Ordinare, scegliere, personalizzare'},
];
const CATEGORY_HINTS: Record<FeedbackCategory, string> = {'Nuovo prodotto': 'Qualcosa da stampare che oggi manca', 'Sito web': 'Ordinare e personalizzare sul sito', WOWPRO: 'Il portale e il servizio in abbonamento', 'Funzionalità': 'Uno strumento che ti farebbe comodo'};
const categoryLabel = (value: string) => categoryFilters.find((filter) => filter.value === value)?.label || value;
const roadmapColumns: Array<FeedbackItem['status']> = ['evaluating', 'implementing', 'completed'];

export function ClientFeedbackBoard({initialItems, now}: {initialItems: FeedbackItem[]; now: number}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [view, setView] = useState<'board' | 'roadmap'>('board');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'votes' | 'recent'>('votes');
  const [isProposing, setIsProposing] = useState(false);
  const [proposeCategory, setProposeCategory] = useState<FeedbackCategory>('WOWPRO');
  const [voting, setVoting] = useState<string | null>(null);

  const stats = useMemo(() => ({
    open: items.filter((item) => item.status === 'new' || item.status === 'evaluating').length,
    implementing: items.filter((item) => item.status === 'implementing').length,
    released: items.filter((item) => item.status === 'completed').length,
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

  // The most voted idea still open gets the spotlight.
  const hot = [...items].filter((item) => item.status !== 'completed' && item.status !== 'rejected' && item.votes > 0).sort((a, b) => b.votes - a.votes || b.createdAt.localeCompare(a.createdAt))[0] || null;
  const propose = (value: FeedbackCategory) => { setProposeCategory(value); setIsProposing(true); };

  return <section className="feedback-portal fx">
    <button aria-label="Proponi un’idea" className="fab" onClick={() => propose('WOWPRO')} type="button"><Plus size={20} /> Proponi</button>
    <PageIntro action={<button className="button button--primary" onClick={() => propose('WOWPRO')} type="button"><Plus size={17} /> Proponi un’idea</button>} text="Proponi miglioramenti al portale, al sito o a WOWPRO, o un nuovo prodotto da stampare. Le idee più votate dai clienti diventano la nostra priorità." title="Aiutaci a costruire la prossima WowStampa" />

    <div className={hot ? 'fx-top' : 'fx-top fx-top--solo'}>
      {hot ? <article className="fx-hot">
        <span className="fx-hot__label"><Flame size={12} /> L’idea più votata</span>
        <h3>{hot.title}</h3>
        <p>{hot.description}</p>
        <div className="fx-hot__foot">
          <div className="fx-hot__votes"><b>{hot.votes}</b><small>{hot.votes === 1 ? 'voto dei clienti' : 'voti dei clienti'}</small></div>
          <CategoryTag category={hot.category} />
          <button aria-pressed={hot.voted} className={hot.voted ? 'fx-vote-big is-voted' : 'fx-vote-big'} disabled={voting === hot.id} onClick={() => vote(hot)} type="button">{hot.voted ? <><Check size={18} /> Hai votato</> : <><ChevronUp size={18} /> Vota anche tu</>}</button>
        </div>
        <Lightbulb aria-hidden="true" className="fx-hot__ghost" size={170} strokeWidth={1.1} />
      </article> : null}
      <aside className="fx-stats"><h4>A che punto sono le idee</h4>
        <div className="fx-stat is-eval"><span><Hourglass size={17} /></span><strong>In valutazione</strong><b>{stats.open}</b></div>
        <div className="fx-stat is-dev"><span><Rocket size={17} /></span><strong>In sviluppo</strong><b>{stats.implementing}</b></div>
        <div className="fx-stat is-done"><span><CheckCircle2 size={17} /></span><strong>Già rilasciate</strong><b>{stats.released}</b></div>
      </aside>
    </div>

    <p className="fx-section-title">Hai un’idea? Parti da qui</p>
    <div className="fx-prompts">
      {PROMPTS.map((prompt) => { const Icon = categoryIcons[prompt.category]; return <button className="fx-prompt" key={prompt.category} onClick={() => propose(prompt.category)} type="button"><span className={`fx-cat--${slug(prompt.category)}`}><Icon size={18} /></span><div><strong>{prompt.title}</strong><small>{prompt.text}</small></div><ArrowRight size={16} /></button>; })}
    </div>

    <div className="fx-bar">
      <div className="fx-tabs" role="tablist">
        <button aria-selected={view === 'board'} className={view === 'board' ? 'is-on' : ''} onClick={() => setView('board')} role="tab" type="button"><LayoutList size={15} /> Bacheca</button>
        <button aria-selected={view === 'roadmap'} className={view === 'roadmap' ? 'is-on' : ''} onClick={() => setView('roadmap')} role="tab" type="button"><Columns3 size={15} /> Roadmap</button>
      </div>
      {view === 'board' ? <div className="fx-cats">
        <button className={category === 'all' ? 'is-on' : ''} onClick={() => setCategory('all')} type="button">Tutte · {items.length}</button>
        {categoryFilters.map((filter) => <button className={category === filter.value ? 'is-on' : ''} key={filter.value} onClick={() => setCategory(filter.value)} type="button"><i className={`fx-dot--${slug(filter.value)}`} /> {filter.label}</button>)}
      </div> : null}
    </div>

    {view === 'board' ? <>
      <div className="fx-tools">
        <label className="client-search"><Search size={16} /><input onChange={(event) => setQuery(event.target.value)} placeholder="Cerca tra le idee..." value={query} /></label>
        <label className="feedback-sort">Ordina<select onChange={(event) => setSort(event.target.value as 'votes' | 'recent')} value={sort}><option value="votes">Più votate</option><option value="recent">Più recenti</option></select></label>
      </div>
      <div className="fx-list">
        {visible.map((item) => <FeedbackCard isVoting={voting === item.id} item={item} key={item.id} now={now} onVote={() => vote(item)} />)}
        {!visible.length ? <div className="feedback-empty"><Search size={22} /><p>{items.length ? 'Nessuna idea corrisponde ai filtri.' : 'Nessuna proposta per ora.'}</p><small>{items.length ? 'Prova a cambiare categoria o proponi una nuova idea.' : 'Sii il primo a suggerire un miglioramento!'}</small></div> : null}
      </div>
    </> : <div className="feedback-roadmap">
      {roadmapColumns.map((status) => {
        const column = items.filter((item) => item.status === status).sort((a, b) => b.votes - a.votes);
        return <section className={`feedback-roadmap__col feedback-roadmap__col--${status}`} key={status}>
          <header><span className={`feedback-pill feedback-pill--${status}`}>{statusLabels[status]}</span><b>{column.length}</b></header>
          {column.map((item) => <article key={item.id}><CategoryTag category={item.category} /><strong>{item.title}</strong><small><ChevronUp size={13} /> {item.votes} voti</small></article>)}
          {!column.length ? <p>Nessuna idea in questa fase.</p> : null}
        </section>;
      })}
    </div>}

    {isProposing ? <ProposeModal initialCategory={proposeCategory} items={items} onClose={() => setIsProposing(false)} onCreated={() => { setIsProposing(false); router.refresh(); }} onVote={(item) => { void vote(item); }} /> : null}
  </section>;
}

function CategoryTag({category}: {category: string}) {
  const Icon = categoryIcons[category] || Lightbulb;
  return <span className={`fx-cat fx-cat--${slug(category)}`}><Icon size={12} />{categoryLabel(category)}</span>;
}

function FeedbackCard({isVoting, item, now, onVote}: {isVoting: boolean; item: FeedbackItem; now: number; onVote: () => void}) {
  const step = STEP_OF[item.status];
  return <article className={`fx-idea${item.status === 'rejected' ? ' is-rejected' : ''}`}>
    <button aria-label={item.voted ? 'Rimuovi voto' : 'Vota questa idea'} aria-pressed={item.voted} className={item.voted ? 'fx-votebtn is-voted' : 'fx-votebtn'} disabled={isVoting} onClick={onVote} type="button"><ChevronUp size={18} /><b>{item.votes}</b><small>{item.voted ? 'votata' : 'vota'}</small></button>
    <div className="fx-idea__body">
      <div className="fx-idea__top"><CategoryTag category={item.category} />{item.status === 'rejected' ? <span className="feedback-pill feedback-pill--rejected">Non in programma</span> : null}</div>
      <h3>{item.title}</h3>
      <p>{item.description}</p>
      {step >= 0 ? <ol aria-label={`Stato: ${STEPS[step]}`} className="fx-track">{STEPS.map((label, index) => <li className={index < step || (index === step && step === STEPS.length - 1) ? 'is-done' : index === step ? 'is-current' : ''} key={label}><i />{label}</li>)}</ol> : null}
      {item.publicResponse ? <div className="fx-reply"><MessageSquareReply size={16} /><span><b>WowStampa ha risposto:</b> {item.publicResponse}</span></div> : null}
      <div className="fx-meta">{item.authorName} · {item.status === 'completed' ? `rilasciata ${relative(item.updatedAt, now)}` : relative(item.createdAt, now)}</div>
    </div>
  </article>;
}

function ProposeModal({initialCategory, items, onClose, onCreated, onVote}: {initialCategory: FeedbackCategory; items: FeedbackItem[]; onClose: () => void; onCreated: () => void; onVote: (item: FeedbackItem) => void}) {
  const [category, setCategory] = useState<FeedbackCategory>(initialCategory);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
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

  return <div aria-modal="true" className="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget && !isSaving) onClose(); }} role="dialog"><section aria-labelledby="ideaTitle" className="client-request-modal fx-modal"><header className="client-request-modal__head"><div><h2 id="ideaTitle">Proponi un’idea</h2><p>Gli altri clienti WOWPRO potranno vederla e votarla.</p></div><button aria-label="Chiudi" className="modal-close" onClick={onClose} type="button"><X size={19} /></button></header>
    <form onSubmit={submit}>
      <div className="client-request-modal__body">
        <fieldset className="service-picker fx-modal__cats"><legend>Di cosa si tratta <b>*</b></legend>{FEEDBACK_CATEGORIES.map((value) => { const Icon = categoryIcons[value]; return <button aria-pressed={category === value} className={category === value ? 'is-selected' : ''} key={value} onClick={() => setCategory(value)} type="button"><span className={`fx-modal__icon fx-cat--${slug(value)}`}><Icon size={17} /></span><span className="fx-modal__text"><strong>{value}</strong><small>{CATEGORY_HINTS[value]}</small></span><span className="service-picker__check">{category === value ? <Check size={14} /> : null}</span></button>; })}</fieldset>
        <label className="request-modal-field"><span className="fx-modal__label">Titolo <b>*</b><small>{title.length}/120</small></span><input className="fx-modal__input" maxLength={120} minLength={5} name="title" onChange={(event) => setTitle(event.target.value)} placeholder="Es. Stampa su tazze personalizzate" required value={title} /></label>
        {similar.length ? <div className="fx-similar"><p><Lightbulb size={15} /> Ci sono già idee simili: se una ti convince, votala invece di duplicarla.</p>{similar.map((item) => <div key={item.id}><span>{item.title}</span><button className={item.voted ? 'is-voted' : ''} onClick={() => onVote(item)} type="button">{item.voted ? <><Check size={13} /> Votata</> : <><ChevronUp size={13} /> Vota · {item.votes}</>}</button></div>)}</div> : null}
        <label className="request-modal-field"><span className="fx-modal__label">Descrizione <b>*</b><small>{description.length}/2000</small></span><textarea maxLength={2000} minLength={10} name="description" onChange={(event) => setDescription(event.target.value)} placeholder="Cosa ti servirebbe e in che situazione ti sarebbe utile? Più dettagli dai, più è facile valutarla." required rows={5} value={description} /></label>
        {error ? <p className="form-error">{error}</p> : null}
      </div>
      <footer className="client-request-modal__foot"><small>Gli altri clienti vedono solo il tuo nome e l’iniziale del cognome.</small><span /><button className="client-action" disabled={isSaving} onClick={onClose} type="button">Annulla</button><button className="client-action client-action--primary" disabled={isSaving} type="submit"><Check size={16} />{isSaving ? 'Invio...' : 'Pubblica idea'}</button></footer>
    </form>
  </section></div>;
}

function slug(value: string) { return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, '-'); }
function relative(value: string, now: number) {
  const days = Math.floor((now - new Date(value).getTime()) / 86_400_000);
  if (days < 1) return 'oggi';
  if (days === 1) return 'ieri';
  if (days < 7) return `${days} giorni fa`;
  if (days < 30) { const weeks = Math.floor(days / 7); return weeks === 1 ? '1 settimana fa' : `${weeks} settimane fa`; }
  const months = Math.floor(days / 30);
  return months === 1 ? '1 mese fa' : `${months} mesi fa`;
}
