import Link from 'next/link';
import {BadgeEuro, Check, CircleCheck, Clock3, Euro, ListTodo, MessageSquareText, UsersRound} from 'lucide-react';

import {PageHeader} from '@/components/app-shell';
import {requireProfile} from '@/lib/auth';
import {listWowproClients, type AirtableWowproClient} from '@/lib/integrations/airtable';
import {getAdminMetrics, type AdminMetrics} from '@/lib/admin-metrics';
import {createAdminClient} from '@/lib/supabase/admin.server';

type TeamMember = {id: string; name: string; role: string};
type DataRow = Record<string, unknown>;

export default async function AdminPage() {
  const profile = await requireProfile(['staff', 'admin']);
  const admin = createAdminClient();
  const [clientsResult, requestsResult, creditsResult, teamResult, subscriptionsResult] = await Promise.allSettled([
    listWowproClients(),
    admin.from('graphic_requests').select('id,public_id,title,status,created_at,completed_at,assigned_to,due_date,companies(name)').order('created_at', {ascending: false}),
    admin.from('credit_transactions').select('id,amount,created_at').order('created_at', {ascending: false}),
    admin.from('profiles').select('id,full_name,email,role').eq('status', 'active').order('full_name'),
    admin.from('subscriptions').select('status,plans(monthly_price_cents)').eq('status', 'active'),
  ]);
  const clients = clientsResult.status === 'fulfilled' ? clientsResult.value : [];
  const requests = rowsFrom(requestsResult);
  const credits = rowsFrom(creditsResult);
  const members = rowsFrom(teamResult).filter((member) => ['admin', 'staff', 'graphic_operator'].includes(String(member.role))).map((member) => ({id: String(member.id), name: String(member.full_name || member.email), role: String(member.role)} as TeamMember));
  const subscriptions = rowsFrom(subscriptionsResult);
  const activeClients = clients.filter(({fields}) => !fields.archiviato && fields.stato_abbonamento?.toLocaleLowerCase('it-IT') === 'attivo').length;
  const openRequests = requests.filter((request) => request.status === 'new' || request.status === 'in_progress');
  const inProgress = requests.filter((request) => request.status === 'in_progress').length;
  const loadedCredits = credits.filter((credit) => isCurrentMonth(String(credit.created_at))).reduce((total, credit) => total + Number(credit.amount || 0), 0);
  const mrr = subscriptions.reduce((total, subscription) => total + planPrice(subscription.plans), 0);

  if (profile.role === 'admin') {
    const metrics = await getAdminMetrics(clients).catch((error) => { console.error('[Admin metrics]', error); return null; });
    return <AdministrationDashboard activeClients={activeClients} clients={clients} credits={loadedCredits} inProgress={inProgress} members={members} metrics={metrics} mrr={mrr} openRequests={openRequests} requests={requests} />;
  }
  return <CommercialDashboard clients={clients} profile={profile} requests={requests} />;
}

function AdministrationDashboard({activeClients, clients, credits, inProgress, members, metrics, mrr, openRequests, requests}: {activeClients: number; clients: Array<{fields: AirtableWowproClient}>; credits: number; inProgress: number; members: TeamMember[]; metrics: AdminMetrics | null; mrr: number; openRequests: DataRow[]; requests: DataRow[]}) {
  const graphics = members.filter((member) => member.role === 'graphic_operator');
  const commercials = members.filter((member) => member.role === 'staff');
  const completedRecently = requests.filter((request) => request.status === 'completed' && isRecent(String(request.completed_at || request.created_at))).length;
  const overdue = requests.find(isOverdue);
  return <><PageHeader eyebrow="WowStampa · Programma WOWPRO" title="Panoramica" /><main className="page-content administration-page">
    <section className="admin-welcome"><div><h2>{greeting()} <span aria-hidden="true">👋</span></h2><p>{completedRecently ? 'Il team ha completato ' + completedRecently + ' richieste di recente.' : 'Tieni sotto controllo il lavoro del team e le prossime assegnazioni.'}</p><div className="admin-welcome__chips"><span>🎉 {completedRecently} richieste completate di recente</span>{overdue ? <Link className="admin-welcome__alert" href="/admin/richieste">⏰ In ritardo: {String(overdue.title)} · {formatDate(String(overdue.due_date))}</Link> : null}</div></div><small>{formatTime(new Date())} · Aggiornato ora</small></section>
    <section className="metric-grid administration-kpis">
      <Metric icon={<UsersRound />} label="Clienti attivi" note={'su ' + clients.filter(({fields}) => !fields.archiviato).length + ' totali'} value={String(activeClients)} />
      <Metric icon={<MessageSquareText />} label="Richieste aperte" note={inProgress + ' in lavorazione'} tone="amber" value={String(openRequests.length)} />
      <Metric icon={<BadgeEuro />} label="Crediti caricati nel mese" note="su lavorazioni grafiche" tone="violet" value={formatNumber(credits)} />
      <Metric icon={<Euro />} label="MRR ricorrente" note={mrr ? 'abbonamenti attivi' : 'piani da valorizzare'} tone="blue" value={mrr ? formatCurrency(mrr) : '—'} />
    </section>
    {metrics ? <BusinessNumbers metrics={metrics} /> : null}
    <section><div className="administration-title"><div><h2>Come lavora il team</h2><p>Chi è carico, chi è in difficoltà e a chi assegnare il prossimo lavoro</p></div><span>Situazione attuale</span></div><GraphicTeam members={graphics} requests={requests} /><CommercialTeam clients={clients} members={commercials} openRequests={openRequests.length} /></section>
  </main></>;
}

function trend(now: number, prev: number) {
  if (!prev) return now ? 'primo mese con dati' : 'nessun dato il mese scorso';
  const change = Math.round(((now - prev) / prev) * 100);
  return `${change >= 0 ? '+' : ''}${change}% sul mese scorso`;
}

function BusinessNumbers({metrics}: {metrics: AdminMetrics}) {
  const hours = metrics.firstDraftHours;
  const turnaround = hours === null ? '—' : hours < 24 ? `${Math.round(hours)} h` : `${(hours / 24).toFixed(1).replace('.', ',')} gg`;
  return <section className="admin-numbers">
    <div className="administration-title"><div><h2>I numeri di WOWPRO</h2><p>Consumi, ordini di stampa e tempi del team</p></div><span>Mese in corso</span></div>
    <div className="metric-grid">
      <Metric icon={<BadgeEuro />} label="Crediti consumati" note={trend(metrics.creditsUsed, metrics.creditsUsedPrev)} tone="violet" value={formatNumber(metrics.creditsUsed)} />
      <Metric icon={<Euro />} label="Ordini di stampa pagati" note={`${new Intl.NumberFormat('it-IT', {style: 'currency', currency: 'EUR'}).format(metrics.ordersRevenue)} · ${trend(metrics.ordersCount, metrics.ordersPrev)}`} tone="blue" value={String(metrics.ordersCount)} />
      <Metric icon={<Clock3 />} label="Tempo medio prima bozza" note={metrics.firstDraftSample ? `su ${metrics.firstDraftSample} richieste negli ultimi 60 giorni` : 'ancora nessuna bozza'} tone="amber" value={turnaround} />
      <Metric icon={<CircleCheck />} label="Richieste approvate" note="sul totale delle richieste chiuse (60 giorni)" value={metrics.approvalRate === null ? '—' : `${metrics.approvalRate}%`} />
    </div>
    <div className="admin-watch">
      <article><header><h3>Rinnovi nei prossimi 14 giorni</h3><small>{metrics.expiring.length}</small></header>{metrics.expiring.length ? <ul>{metrics.expiring.map((item) => <li key={item.name + item.date}><strong>{item.name}</strong><span>{item.days === 0 ? 'oggi' : item.days === 1 ? 'domani' : `tra ${item.days} giorni`} · {formatDate(item.date)}</span></li>)}</ul> : <p>Nessun rinnovo in arrivo.</p>}</article>
      <article><header><h3>Clienti quasi senza crediti</h3><small>{metrics.lowCredits.length}</small></header>{metrics.lowCredits.length ? <ul>{metrics.lowCredits.map((item) => <li key={item.name}><strong>{item.name}</strong><span>{formatNumber(item.left)} crediti rimasti su {formatNumber(item.monthly)} al mese · proponi crediti extra</span></li>)}</ul> : <p>Tutti i clienti hanno crediti sufficienti.</p>}</article>
    </div>
  </section>;
}

function GraphicTeam({members, requests}: {members: TeamMember[]; requests: DataRow[]}) {
  const assigned = requests.filter((request) => Boolean(request.assigned_to)).length;
  const working = requests.filter((request) => request.status === 'in_progress' && request.assigned_to).length;
  const delayed = requests.filter(isOverdue).length;
  return <section className="team-panel"><div className="team-panel__title"><h3>Team Grafico</h3><span>{assigned} assegnate · {working} in lavorazione · {delayed} in ritardo</span></div><div className="graphic-team-head"><span>Operatore</span><span>Carico</span><span>In corso</span><span>Completate</span><span>Ritardi</span><span>Disponibilità</span></div>{members.map((member) => <GraphicRow key={member.id} member={member} requests={requests} />)}{!members.length ? <p className="client-list__empty">Nessun operatore grafico attivo. Aggiungilo in Team & ruoli.</p> : null}</section>;
}

function GraphicRow({member, requests}: {member: TeamMember; requests: DataRow[]}) {
  const assigned = requests.filter((request) => request.assigned_to === member.id);
  const load = Math.min(assigned.filter((request) => request.status === 'new' || request.status === 'in_progress').length, 5);
  const working = assigned.filter((request) => request.status === 'in_progress').length;
  const completed = assigned.filter((request) => request.status === 'completed').length;
  const delayed = assigned.filter(isOverdue).length;
  return <article className="graphic-team-row"><OperatorName member={member} /><div><strong>{load} / 5</strong><span className="load-meter"><i className={load >= 4 ? 'load-meter--amber' : ''} style={{width: String(load * 20) + '%'}} /></span></div><strong>{working}</strong><strong>{completed}</strong><span className={delayed ? 'delay-pill' : 'delay-pill delay-pill--none'}>{delayed || '—'}</span><strong className={load >= 4 ? 'availability availability--busy' : 'availability'}>{load >= 4 ? 'Quasi piena' : 'Carico regolare'}</strong></article>;
}

function CommercialTeam({clients, members, openRequests}: {clients: Array<{fields: AirtableWowproClient}>; members: TeamMember[]; openRequests: number}) {
  return <section className="team-panel"><div className="team-panel__title"><h3>Team Commerciale</h3><span>{clients.length} clienti gestiti · {openRequests} richieste aperte</span></div><div className="commercial-team-head"><span>Operatore</span><span>Clienti</span><span>Aperte</span><span>Da seguire</span></div>{members.map((member) => { const clientsCount = clients.filter(({fields}) => fields.account_manager_nome?.trim().toLocaleLowerCase('it-IT') === member.name.trim().toLocaleLowerCase('it-IT')).length; return <article className="commercial-team-row" key={member.id}><OperatorName member={member} /><strong>{clientsCount}</strong><strong>—</strong><span className="delay-pill delay-pill--none">—</span></article>; })}{!members.length ? <p className="client-list__empty">Nessun operatore commerciale attivo.</p> : null}</section>;
}

function OperatorName({member}: {member: TeamMember}) { return <div className="operator-name"><span>{initials(member.name)}</span><div><strong>{member.name}</strong><small>{member.role === 'graphic_operator' ? 'Operatore Grafico' : 'Operatore Commerciale'}</small></div></div>; }

function CommercialDashboard({clients, profile, requests}: {clients: Array<{fields: AirtableWowproClient}>; profile: {email: string; full_name: string | null}; requests: DataRow[]}) {
  const managerName = profile.full_name?.trim().toLocaleLowerCase('it-IT') || '';
  const managedClients = clients.filter(({fields}) => !fields.archiviato && Boolean(managerName) && fields.account_manager_nome?.trim().toLocaleLowerCase('it-IT') === managerName);
  const managedNames = new Set(managedClients.map(({fields}) => (fields.ragione_sociale || fields.cliente_id || '').trim().toLocaleLowerCase('it-IT')).filter(Boolean));
  const managedRequests = requests.filter((request) => managedNames.has(requestCompanyName(request).toLocaleLowerCase('it-IT')));
  const openRequests = managedRequests.filter((request) => request.status === 'new' || request.status === 'in_progress');
  const working = managedRequests.filter((request) => request.status === 'in_progress');
  const completedRecently = managedRequests.filter((request) => request.status === 'completed' && isRecent(String(request.completed_at || request.created_at)));
  const overdue = openRequests.find(isOverdue);
  const firstName = (profile.full_name || profile.email).split(' ')[0];

  return <><PageHeader eyebrow="WowStampa · Team commerciale" title="Dashboard" /><main className="page-content administration-page commercial-dashboard">
    <section className="admin-welcome"><div><h2>{greeting()}, {firstName} <span aria-hidden="true">👋</span></h2><p>{openRequests.length ? `Hai ${openRequests.length} lavorazioni da tenere d'occhio.` : 'Non ci sono lavorazioni aperte da seguire in questo momento.'}</p><div className="admin-welcome__chips"><span>🎉 {completedRecently.length} richieste completate di recente</span>{overdue ? <Link className="admin-welcome__alert" href="/admin/richieste">⏰ In ritardo: {String(overdue.title)} · {formatDate(String(overdue.due_date))}</Link> : null}</div></div><small>{formatTime(new Date())} · Aggiornato ora</small></section>
    <section className="metric-grid administration-kpis">
      <Metric icon={<UsersRound />} label="Clienti assegnati" note="con abbonamento attivo" value={String(managedClients.length)} />
      <Metric icon={<ListTodo />} label="Lavorazioni da seguire" note={working.length + ' in lavorazione'} tone="amber" value={String(openRequests.length)} />
      <Metric icon={<Clock3 />} label="In attesa di avvio" note="richieste nuove" tone="violet" value={String(openRequests.filter((request) => request.status === 'new').length)} />
      <Metric icon={<CircleCheck />} label="Completate di recente" note="negli ultimi 7 giorni" tone="blue" value={String(completedRecently.length)} />
    </section>
    <section className="commercial-work-section"><div className="administration-title"><div><h2>Lavorazioni da tenere d&apos;occhio</h2><p>Le richieste aperte dei tuoi clienti, ordinate dalla piu recente</p></div><Link className="button button--secondary button--small" href="/admin/richieste">Tutte le richieste</Link></div><div className="commercial-work-list">{openRequests.slice(0, 5).map((request) => <CommercialWorkRow key={String(request.id)} request={request} />)}{!openRequests.length ? <div className="commercial-work-empty"><Check size={20} /><div><strong>Tutto sotto controllo</strong><p>Non ci sono lavorazioni aperte per i clienti a te assegnati.</p></div></div> : null}</div></section>
  </main></>;
}

function CommercialWorkRow({request}: {request: DataRow}) {
  const working = request.status === 'in_progress';
  return <Link className="commercial-work-row" href="/admin/richieste"><div><div className="commercial-work-row__meta"><span>{String(request.public_id)}</span><b className={working ? 'commercial-work-status commercial-work-status--working' : 'commercial-work-status'}>{working ? 'In lavorazione' : 'Nuova'}</b><em>{requestTypeLabel(String(request.type))} · {formatNumber(Number(request.credit_cost || 0))} crediti</em></div><h3>{String(request.title)}</h3><p>{requestCompanyName(request)} · {formatDate(String(request.created_at))}</p></div><span className="commercial-work-row__action">Apri richiesta</span></Link>;
}

function Metric({icon, label, note, tone = 'green', value}: {icon: React.ReactNode; label: string; note: string; tone?: string; value: string}) { return <article className="metric-card"><span className={'metric-icon metric-icon--' + tone}>{icon}</span><p>{label}</p><strong>{value}</strong><small>{note}</small></article>; }
function rowsFrom(result: unknown): DataRow[] { if (!result || typeof result !== 'object') return []; const settled = result as {status?: string; value?: {data?: DataRow[] | null; error?: unknown}}; const value = settled.value; return settled.status === 'fulfilled' && value && !value.error ? value.data || [] : []; }
function planPrice(value: unknown) { if (!value || typeof value !== 'object' || Array.isArray(value)) return 0; const cents = (value as Record<string, unknown>).monthly_price_cents; return typeof cents === 'number' ? cents : 0; }
function isCurrentMonth(value: string) { const date = new Date(value); const today = new Date(); return date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear(); }
function isRecent(value: string) { return Date.now() - Date.parse(value) < 7 * 24 * 60 * 60 * 1000; }
function isOverdue(request: DataRow) { return Boolean(request.due_date) && Date.parse(String(request.due_date)) < Date.now() && !['completed', 'rejected'].includes(String(request.status)); }
function greeting() { const hour = new Date().getHours(); return hour < 12 ? 'Buongiorno' : hour < 18 ? 'Buon pomeriggio' : 'Buonasera'; }
function formatDate(value: string) { return new Intl.DateTimeFormat('it-IT', {day: '2-digit', month: 'short', year: 'numeric'}).format(new Date(value)); }
function formatTime(value: Date) { return new Intl.DateTimeFormat('it-IT', {hour: '2-digit', minute: '2-digit'}).format(value); }
function formatNumber(value: number) { return new Intl.NumberFormat('it-IT', {useGrouping: 'always'} as Intl.NumberFormatOptions).format(value); }
function formatCurrency(value: number) { return new Intl.NumberFormat('it-IT', {style: 'currency', currency: 'EUR', maximumFractionDigits: 0}).format(value / 100); }
function initials(value: string) { return value.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
function asRecord(value: unknown) { return value && typeof value === 'object' && !Array.isArray(value) ? value as DataRow : {}; }
function requestCompanyName(request: DataRow) { const relation = request.companies; const company = Array.isArray(relation) ? asRecord(relation[0]) : asRecord(relation); return typeof company.name === 'string' && company.name.trim() ? company.name.trim() : 'Cliente WOWPRO'; }
function requestTypeLabel(value: string) { return value === 'creation' ? 'Creazione' : value === 'revision' ? 'Revisione' : 'Modifica'; }
