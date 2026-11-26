import Link from 'next/link';
import {redirect} from 'next/navigation';
import {BadgeCheck, Coins, Crown, ExternalLink, Headphones, Info, Mail, Package, Palette, Pencil, Phone, Plus, Receipt, Sparkles} from 'lucide-react';

import {PageHeader} from '@/components/app-shell';
import {RequestsHub} from '@/components/requests-hub';
import {ClientOrders} from '@/components/client-orders';
import {OpenChatButton} from '@/components/support-widget';
import {MobileTabs} from '@/components/mobile-tabs';
import {SupportChat} from '@/components/support-chat';
import {ClientFeedbackBoard, type FeedbackItem} from '@/components/client-feedback-board';
import {getConversationCompany} from '@/lib/support';
import {createAdminClient} from '@/lib/supabase/admin.server';
import {requireProfile} from '@/lib/auth';
import {getWowproClient} from '@/lib/integrations/airtable';
import {getCustomerAccountUrl, getCustomerSubscription, getLatestBillingDetails, getSubscriptionOptions, listCustomerOrders, subscriptionPlanLabel, type CustomerOrder, type CustomerSubscription} from '@/lib/integrations/shopify';
import {SubscriptionActions, type BillingDraft} from '@/components/subscription-actions';
import {SubscriptionLanding} from '@/components/subscription-landing';
import {listQuotes} from '@/lib/quotes';
import {billingFromClient} from '@/lib/billing';
import {countSubscriptionPayments} from '@/lib/subscription';
import {listRequestFiles} from '@/lib/request-files';
import {createClient} from '@/lib/supabase/server';
import {hasActiveSubscription, isActiveStatus, OPEN_CLIENT_SECTIONS} from '@/lib/access';
import {LockedSection} from '@/components/locked-section';
import {Avatar} from '@/components/avatar';
import {PlanTabs} from '@/components/plan-tabs';
import {PageIntro} from '@/components/page-intro';
import {CreditsOverview} from '@/components/credits-overview';
import {ClientFiles} from '@/components/client-files';
import {ClientSettings} from '@/components/client-settings';
import {listClientFiles} from '@/lib/client-files';
import {listInvoices} from '@/lib/invoices';
import {ClientInvoices} from '@/components/client-invoices';
import {readPrefs} from '@/lib/notification-prefs';
import {BrandKitEditor} from '@/components/brand-kit';
import {readBrandKit, toBrandKitView} from '@/lib/brand-kit';

const titles: Record<string, string> = {workspace: 'Dashboard', 'brand-kit': 'Brand kit', crediti: 'Piano e crediti', file: 'File', fatture: 'Piano e crediti', impostazioni: 'Impostazioni', richieste: 'Richieste grafiche', ordini: 'Ordini', abbonamento: 'Abbonamento', preventivi: 'Preventivi', supporto: 'Messaggi', feedback: 'Feedback & idee'};

export default async function ClientSectionPage({params, searchParams}: {params: Promise<{section: string}>; searchParams: Promise<Record<string, string | string[] | undefined>>}) {
  const {section} = await params;
  if (!OPEN_CLIENT_SECTIONS.includes(section)) {
    const profile = await requireProfile(['client']);
    if (!(await hasActiveSubscription(profile.company_id))) return <><PageHeader eyebrow="WOWPRO · Area cliente" title={section === 'preventivi' ? 'Richieste' : titles[section] || 'WOWPRO'} /><LockedSection section={section === 'preventivi' ? 'richieste' : section} /></>;
  }
  // The workspace lives on /dashboard: this route only exists as the locked entry for non-subscribers.
  if (section === 'workspace') redirect('/dashboard');
  if (section === 'crediti') return <CreditsPage />;
  if (section === 'richieste') return <RequestsPage />;
  if (section === 'ordini') return <OrdersPage />;
  if (section === 'brand-kit') return <BrandKitPage />;
  if (section === 'file') return <FilesPage />;
  if (section === 'fatture') return <InvoicesPage />;
  if (section === 'impostazioni') return <SettingsPage />;
  if (section === 'abbonamento') return <SubscriptionPage />;
  if (section === 'preventivi') return redirectQuotes(await searchParams);
  if (section === 'supporto') return <SupportPage />;
  if (section === 'feedback') return <FeedbackPage />;
  const title = titles[section] || 'WOWPRO';
  return <><PageHeader eyebrow="WOWPRO · Area cliente" title={title} /><main className="page-content"><section className="empty-card empty-card--section"><span className="eyebrow">IN PREPARAZIONE</span><h2>{title}</h2><p>Questo spazio verrà collegato ai dati del tuo account.</p></section></main></>;
}

async function CreditsPage() {
  const profile = await requireProfile(['client']);
  const supabase = await createClient();
  const [{data: company}, {data: transactions}] = await Promise.all([supabase.from('companies').select('airtable_record_id').eq('id', profile.company_id || '').maybeSingle(), supabase.from('credit_transactions').select('id,bucket,amount,description,created_at').order('created_at', {ascending: false})]);
  let included = 0; let extra = 0; let monthly = 0; let renewal = '';
  if (company?.airtable_record_id) { try { const record = await getWowproClient(company.airtable_record_id, {fresh: true}); included = Number(record.fields.crediti_inclusi_residui || 0); extra = Number(record.fields.crediti_extra_residui || 0); monthly = Number(record.fields.crediti_inclusi_mese || 0); renewal = record.fields.data_rinnovo_piano || ''; } catch { /* Balances are temporarily unavailable. */ } }
  const moves = (transactions || []).map((transaction) => ({id: transaction.id, bucket: transaction.bucket, amount: transaction.amount, description: transaction.description, createdAt: transaction.created_at}));
  return <><PageHeader eyebrow="WOWPRO · Area cliente" title="Piano e crediti" /><main className="page-content credits-page"><PlanTabs current="crediti" />
    <CreditsOverview extra={extra} included={included} monthly={monthly} moves={moves} renewal={renewal} />
  </main></>;
}

const SUBSCRIPTION_STATUS: Record<string, {label: string; tone: string}> = {
  ACTIVE: {label: 'Attivo', tone: 'ok'}, PAUSED: {label: 'In pausa', tone: 'warn'}, CANCELLED: {label: 'Disdetto', tone: 'off'},
  EXPIRED: {label: 'Scaduto', tone: 'off'}, FAILED: {label: 'Pagamento non riuscito', tone: 'warn'},
};

async function SubscriptionPage() {
  const profile = await requireProfile(['client']);
  const supabase = await createClient();
  const {data: company} = await supabase.from('companies').select('airtable_record_id,shopify_customer_id').eq('id', profile.company_id || '').maybeSingle();
  let plan = ''; let crmStatus = ''; let crmRenewal = ''; let monthly = 0;
  let billingDraft: BillingDraft = {company: '', vatNumber: '', taxCode: '', sdi: '', pec: '', address: '', zip: '', city: '', province: ''};
  let customerId = company?.shopify_customer_id || '';
  let email = profile.email;
  if (company?.airtable_record_id) {
    try {
      const record = await getWowproClient(company.airtable_record_id);
      plan = record.fields.piano ? `WOWPRO ${record.fields.piano}` : '';
      crmStatus = record.fields.stato_abbonamento || '';
      billingDraft = billingFromClient(record.fields);
      crmRenewal = record.fields.data_rinnovo_piano || '';
      monthly = Number(record.fields.crediti_inclusi_mese || 0);
      customerId = record.fields.shopify_customer_id || customerId;
      email = record.fields.email_login || email;
    } catch { /* The CRM is optional here: Shopify data is shown anyway. */ }
  }
  let subscription: CustomerSubscription = {status: null, nextBillingDate: null, plan: null, price: null, billing: null};
  let payments: CustomerOrder[] = [];
  let hasLoadError = false;
  const [subscriptionResult, ordersResult, managerResult] = await Promise.allSettled([
    getCustomerSubscription({customerId, email}),
    listCustomerOrders({customerId, email}),
    profile.company_id ? getConversationCompany(profile.company_id) : Promise.resolve(null),
  ]);
  if (subscriptionResult.status === 'fulfilled') subscription = subscriptionResult.value; else { hasLoadError = true; console.error('[Subscription]', subscriptionResult.reason); }
  if (ordersResult.status === 'fulfilled') payments = ordersResult.value.filter((order) => order.subscriptionPlan); else { hasLoadError = true; console.error('[Subscription orders]', ordersResult.reason); }
  const managerName = managerResult.status === 'fulfilled' ? managerResult.value?.manager?.name || null : null;
  const latestOrder = ordersResult.status === 'fulfilled' ? payments[0] || ordersResult.value[0] : undefined;
  const paidCount = company?.airtable_record_id ? await countSubscriptionPayments(company.airtable_record_id).catch(() => 0) : 0;
  // Billing details saved in the portal come first; otherwise those on the latest order.
  let billing: CustomerSubscription['billing'] = billingDraft.vatNumber ? {name: null, company: billingDraft.company, lines: [billingDraft.address, [billingDraft.zip, billingDraft.city, billingDraft.province ? `(${billingDraft.province})` : ''].filter(Boolean).join(' ')].filter(Boolean), extra: [{label: 'Partita IVA', value: billingDraft.vatNumber}, ...(billingDraft.taxCode ? [{label: 'Codice fiscale', value: billingDraft.taxCode}] : []), ...(billingDraft.sdi ? [{label: 'Codice SDI', value: billingDraft.sdi}] : []), ...(billingDraft.pec ? [{label: 'PEC', value: billingDraft.pec}] : [])]} : null;
  if (!billing && latestOrder) { try { billing = await getLatestBillingDetails(latestOrder.id); } catch (error) { console.error('[Subscription billing]', error); } }

  // Shopify (via Flow) is the source of truth; the CRM fills in until the first sync.
  // Active when paid through Shopify or set "Attivo" by the team in Airtable; the CRM status fills in until Flow syncs.
  const statusKey = subscription.status || (paidCount || isActiveStatus(crmStatus) ? (/attiv/i.test(crmStatus) ? 'ACTIVE' : /disd|cessat|annull/i.test(crmStatus) ? 'CANCELLED' : /paus|sospes/i.test(crmStatus) ? 'PAUSED' : '') : '');
  const status = SUBSCRIPTION_STATUS[statusKey] || {label: 'Non attivo', tone: 'off'};
  const nextBilling = statusKey ? subscription.nextBillingDate || crmRenewal : '';
  const planName = subscriptionPlanLabel(subscription.plan) || subscriptionPlanLabel(payments[0]?.subscriptionPlan) || plan || 'WOWPRO';
  const isActive = statusKey === 'ACTIVE' || statusKey === 'FAILED';

  const overview = <section className="subscription-hero">
    <article className="subscription-hero__plan">
      <span className="credits-hero__label"><i /> IL TUO ABBONAMENTO</span>
      <div className="subscription-hero__title"><h2>{planName}</h2><b className={`subscription-status subscription-status--${status.tone}`}>{status.label}</b></div>
      <dl className="subscription-hero__facts">
        <div><dt>{statusKey === 'CANCELLED' || statusKey === 'EXPIRED' ? 'Termine' : 'Prossimo rinnovo'}</dt><dd>{nextBilling ? date(nextBilling) : '—'}</dd></div>
        <div><dt>Importo</dt><dd>{subscription.price || (payments[0] ? money(payments[0].total, payments[0].currency) : '—')}</dd></div>
        <div><dt>Crediti inclusi</dt><dd>{monthly ? `${number(monthly)} / mese` : '—'}</dd></div>
      </dl>
      {statusKey === 'FAILED' ? <p className="subscription-hero__alert">L’ultimo addebito non è andato a buon fine: aggiorna il metodo di pagamento per non perdere i vantaggi WOWPRO.</p> : null}
      <SubscriptionActions accountUrl={getCustomerAccountUrl()} active={isActive} billing={billingDraft} managerName={managerName} options={getSubscriptionOptions()} payments={paidCount} />
      <p className="subscription-hero__note"><Info size={14} /> Pagamento con carta sul checkout sicuro di WowStampa. Il rinnovo è automatico e puoi richiedere la disdetta in qualsiasi momento.</p>
    </article>
  </section>;

  const paymentsList = <section>
    <div className="credits-section-title"><h2>Pagamenti dell’abbonamento</h2><p>Ogni rinnovo genera un ordine su WowStampa</p></div>
    {payments.length ? <div className="subscription-payments">{payments.map((order) => <article key={order.id}>
      <div><strong>{order.name}</strong><small>{date(order.createdAt)} · {subscriptionPlanLabel(order.subscriptionPlan)}</small></div>
      <b>{money(order.total, order.currency)}</b>
      <span className={order.cancelled ? 'subscription-status subscription-status--off' : order.financialStatus === 'PAID' ? 'subscription-status subscription-status--ok' : 'subscription-status subscription-status--warn'}>{order.cancelled ? 'Annullato' : order.financialStatus === 'PAID' ? 'Pagato' : order.financialStatus === 'REFUNDED' ? 'Rimborsato' : 'In attesa'}</span>
      {order.statusPageUrl ? <a href={order.statusPageUrl} rel="noreferrer" target="_blank">Ricevuta <ExternalLink size={13} /></a> : <span />}
    </article>)}</div> : <div className="credits-ledger__empty"><Receipt size={20} /><strong>{hasLoadError ? 'Pagamenti non disponibili' : 'Nessun pagamento'}</strong><p>{hasLoadError ? 'Riprova tra qualche istante.' : 'I pagamenti dell’abbonamento compariranno qui dopo il primo addebito.'}</p></div>}
  </section>;

  const billingCard = <section>
    <div className="credits-section-title"><h2>Dati di fatturazione</h2><p>Usati per la fattura elettronica (SDI)</p></div>
    <article className="subscription-billing">
      {billing ? <><div><strong>{billing.company || billing.name || 'Intestatario'}</strong>{billing.company && billing.name ? <small>{billing.name}</small> : null}{billing.lines.map((line) => <span key={line}>{line}</span>)}</div>{billing.extra.length ? <dl>{billing.extra.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl> : null}</>
        : <p className="subscription-billing__empty">I dati di fatturazione compariranno qui dal tuo prossimo ordine su WowStampa.</p>}
      <footer><p>Le fatture sono emesse da <b>Strategia Associati in Comunicazione S.r.l.</b> e inviate tramite SDI con i dati indicati nell’ordine. Per correggerli scrivi al tuo account manager.</p><OpenChatButton className="client-action">Scrivi all’account manager</OpenChatButton></footer>
    </article>
  </section>;

  // Never subscribed: a sales page instead of an empty account summary.
  if (!paidCount && !subscription.status && !(await hasActiveSubscription(profile.company_id))) {
    return <><PageHeader eyebrow="WOWPRO · Area cliente" title="Piano e crediti" /><main className="page-content subscription-page"><PlanTabs current="abbonamento" locked={!(await hasActiveSubscription(profile.company_id))} /><SubscriptionLanding billing={billingDraft} managerName={managerName} options={getSubscriptionOptions()} payments={paidCount} /></main></>;
  }

  return <><PageHeader eyebrow="WOWPRO · Area cliente" title="Piano e crediti" /><main className="page-content subscription-page"><PlanTabs current="abbonamento" locked={!(await hasActiveSubscription(profile.company_id))} />
    <MobileTabs tabs={[{id: 'piano', label: 'Piano', content: overview}, {id: 'pagamenti', label: 'Pagamenti', content: paymentsList}, {id: 'fatturazione', label: 'Fatturazione', content: billingCard}]} />
  </main></>;
}

function money(value: number, currency: string) { return new Intl.NumberFormat('it-IT', {style: 'currency', currency}).format(value); }

// Quotes now live in the Richieste page: old links (emails, bookmarks) are redirected there.
async function redirectQuotes(search: Record<string, string | string[] | undefined>): Promise<never> {
  await requireProfile(['client']);
  const q = typeof search.q === 'string' ? search.q : '';
  redirect(`/dashboard/richieste?tab=preventivi${q ? `&q=${encodeURIComponent(q)}` : ''}`);
}

async function BrandKitPage() {
  const profile = await requireProfile(['client']);
  const kit = toBrandKitView(await readBrandKit(profile.company_id || ''));
  return <><PageHeader eyebrow="WOWPRO · Area cliente" title="Brand kit" /><main className="page-content brand-kit-page">
    <PageIntro text="Carica una volta logo, colori, font e file aziendali: il tuo grafico li trova già pronti in ogni richiesta, senza doverteli chiedere." title="Il tuo brand, sempre a portata del team" />
    <BrandKitEditor canEdit initial={kit} />
  </main></>;
}

async function InvoicesPage() {
  const profile = await requireProfile(['client']);
  const invoices = await listInvoices(profile.company_id || '').catch(() => []);
  return <><PageHeader eyebrow="WOWPRO · Area cliente" title="Piano e crediti" /><main className="page-content invoices-page"><PlanTabs current="fatture" />
    <PageIntro text="Abbonamento, crediti extra e ordini di stampa: scaricale quando ti servono." title="Le tue fatture" />
    <ClientInvoices invoices={invoices.map(({id, name, size, orderName, postedAt}) => ({id, name, size, orderName, postedAt}))} />
  </main></>;
}

async function FilesPage() {
  const profile = await requireProfile(['client']);
  const groups = await listClientFiles(profile.company_id || '');
  return <><PageHeader eyebrow="WOWPRO · Area cliente" title="File" /><main className="page-content files-page">
    <PageIntro action={<Link className="button button--primary" href="/dashboard/richieste?new=grafica"><Plus size={17} /> Nuova grafica</Link>} text="Bozze e file definitivi consegnati dal team: scaricali quando vuoi o mandali in stampa." title="Le tue grafiche" />
    <ClientFiles groups={groups} />
  </main></>;
}

async function SettingsPage() {
  const profile = await requireProfile(['client']);
  const admin = createAdminClient();
  const [{data: me}, {data: people}, {data: company}] = await Promise.all([
    admin.from('profiles').select('*').eq('id', profile.id).maybeSingle(),
    admin.from('profiles').select('id,full_name,email,status,last_login_at').eq('company_id', profile.company_id || '').eq('role', 'client').in('status', ['active', 'invited', 'suspended']).order('full_name'),
    admin.from('companies').select('airtable_record_id').eq('id', profile.company_id || '').maybeSingle(),
  ]);
  let billing: BillingDraft = {company: '', vatNumber: '', taxCode: '', sdi: '', pec: '', address: '', zip: '', city: '', province: ''};
  if (company?.airtable_record_id) { try { billing = billingFromClient((await getWowproClient(company.airtable_record_id, {fresh: true})).fields); } catch { /* Empty form when Airtable is unreachable. */ } }
  const colleagues = (people || []).map((person) => ({id: person.id, name: person.full_name || '', email: person.email, status: person.status, lastLogin: person.last_login_at, me: person.id === profile.id}));
  return <><PageHeader eyebrow="WOWPRO · Area cliente" title="Impostazioni" /><main className="page-content settings-page">
    <ClientSettings billing={billing} colleagues={colleagues} notifications={'notification_prefs' in (me || {}) ? readPrefs(me?.notification_prefs) : null} profile={{fullName: me?.full_name || '', email: me?.email || profile.email, phone: me?.phone || ''}} />
  </main></>;
}

async function OrdersPage() {
  const profile = await requireProfile(['client']);
  const supabase = await createClient();
  const {data: company} = await supabase.from('companies').select('airtable_record_id,shopify_customer_id').eq('id', profile.company_id || '').maybeSingle();
  let orders: CustomerOrder[] = [];
  let invoices: Awaited<ReturnType<typeof listInvoices>> = [];
  let hasLoadError = false;
  try {
    let customerId = company?.shopify_customer_id || '';
    let email = profile.email;
    if (company?.airtable_record_id) {
      const record = await getWowproClient(company.airtable_record_id);
      customerId = record.fields.shopify_customer_id || customerId;
      email = record.fields.email_login || email;
    }
    orders = await listCustomerOrders({customerId, email});
    invoices = await listInvoices(profile.company_id || '').catch(() => []);
  } catch (error) {
    console.error('[Client orders]', error);
    hasLoadError = true;
  }
  return <><PageHeader eyebrow="WOWPRO · Area cliente" title="Ordini" /><main className="page-content">{hasLoadError ? <section className="empty-card empty-card--section"><span className="eyebrow">COLLEGAMENTO NON DISPONIBILE</span><h2>Impossibile caricare gli ordini</h2><p>Riprova tra qualche istante. Se il problema continua, contatta il tuo account manager.</p></section> : <ClientOrders invoices={Object.fromEntries(invoices.filter((invoice) => invoice.orderName).map((invoice) => [invoice.orderName!, invoice.id]))} orders={orders} />}</main></>;
}

async function FeedbackPage() {
  const profile = await requireProfile(['client']);
  let items: FeedbackItem[] = [];
  let hasLoadError = false;
  const now = new Date().getTime();
  try {
    const admin = createAdminClient();
    const [{data, error}, {data: votes, error: votesError}] = await Promise.all([
      admin.from('feedback').select('id,title,description,category,status,public_response,created_at,updated_at,author:author_id(full_name,email),companies(name)').order('created_at', {ascending: false}),
      admin.from('feedback_votes').select('feedback_id,voter_id'),
    ]);
    if (error || votesError) throw error || votesError;
    const counts = new Map<string, number>();
    const mine = new Set<string>();
    for (const vote of votes || []) {
      counts.set(vote.feedback_id, (counts.get(vote.feedback_id) || 0) + 1);
      if (vote.voter_id === profile.id) mine.add(vote.feedback_id);
    }
    items = (data || []).map((row) => {
      const author = (Array.isArray(row.author) ? row.author[0] : row.author) as {full_name?: string; email?: string} | null;
      const company = (Array.isArray(row.companies) ? row.companies[0] : row.companies) as {name?: string} | null;
      return {id: row.id, title: row.title, description: row.description, category: row.category, status: row.status, publicResponse: row.public_response || '', authorName: shortName(author?.full_name || company?.name || 'Cliente WOWPRO'), votes: counts.get(row.id) || 0, voted: mine.has(row.id), createdAt: row.created_at, updatedAt: row.updated_at};
    });
  } catch (error) { console.error('[Client feedback]', error); hasLoadError = true; }
  return <><PageHeader eyebrow="WOWPRO · Area cliente" title="Feedback & idee" /><main className="page-content">{hasLoadError ? <section className="empty-card empty-card--section"><span className="eyebrow">BACHECA NON DISPONIBILE</span><h2>Impossibile caricare le proposte</h2><p>Riprova tra qualche istante.</p></section> : <ClientFeedbackBoard initialItems={items} now={now} />}</main></>;
}

// "Andrea Rossi" → "Andrea R.": other clients see only first name and initial.
function shortName(value: string) { const [first, ...rest] = value.trim().split(/\s+/); return rest.length ? `${first} ${rest[rest.length - 1][0].toUpperCase()}.` : first; }

async function SupportPage() {
  const profile = await requireProfile(['client']);
  type Contact = {id: string; name: string; email: string; phone: string | null};
  let manager: Contact | null = null;
  let designer: Contact | null = null;
  if (profile.company_id) {
    try {
      const admin = createAdminClient();
      const company = await getConversationCompany(profile.company_id);
      if (company?.manager) manager = {...company.manager, phone: null};
      // Dedicated designer set on the client, otherwise the designer of the most recent assigned request.
      const {data: link} = await admin.from('companies').select('designer_id').eq('id', profile.company_id).maybeSingle();
      const dedicatedId = (link as {designer_id?: string | null} | null)?.designer_id;
      if (dedicatedId) {
        const {data: person} = await admin.from('profiles').select('id,full_name,email').eq('id', dedicatedId).maybeSingle();
        if (person?.email) designer = {id: person.id, name: person.full_name || person.email, email: person.email, phone: null};
      }
      const {data} = designer ? {data: null} : await admin.from('graphic_requests').select('assigned_to,designer:assigned_to(full_name,email)').eq('company_id', profile.company_id).not('assigned_to', 'is', null).order('created_at', {ascending: false}).limit(1).maybeSingle();
      const person = (Array.isArray(data?.designer) ? data?.designer[0] : data?.designer) as {full_name?: string; email?: string} | null | undefined;
      if (data?.assigned_to && person?.email) designer = {id: data.assigned_to, name: person.full_name || person.email, email: person.email, phone: null};
      const ids = [manager?.id, designer?.id].filter(Boolean) as string[];
      if (ids.length) {
        const {data: phones} = await admin.from('profiles').select('id,phone').in('id', ids);
        for (const row of phones || []) {
          if (manager && row.id === manager.id) manager.phone = row.phone || null;
          if (designer && row.id === designer.id) designer.phone = row.phone || null;
        }
      }
    } catch (error) { console.error('[Support contacts]', error); }
  }
  // Graphic requests the designer is working on for this client.
  const designerWork = designer && profile.company_id ? (await createAdminClient().from('graphic_requests').select('id', {count: 'exact', head: true}).eq('company_id', profile.company_id).eq('assigned_to', designer.id).in('status', ['new', 'in_progress', 'review'])).count || 0 : 0;
  const actions = (person: Contact | null, main: React.ReactNode) => <div className="mx-actions">{main}{person ? <a href={`mailto:${person.email}`}><Mail size={15} /> Email</a> : null}</div>;
  return <><PageHeader eyebrow="WOWPRO · Area cliente" title="Messaggi" /><main className="page-content messages-page">
    <PageIntro text={`Una linea diretta con chi segue la tua azienda: scrivi qui a ${manager?.name?.split(' ')[0] || 'il tuo account manager'}, ti risponde in chat e ricevi un avviso via email.`} title="Messaggi con il tuo team" />
    <div className="messages-layout">
      <SupportChat emptyHint={`Scrivi a ${manager?.name || 'il tuo account manager'}: ti risponderà qui e riceverai un avviso via email.`} managerId={manager?.id || null} prompts={['Domanda su un ordine', 'Vorrei un preventivo', 'Info su crediti e abbonamento', 'Problema con un file']} viewer="client" />
      <aside className="mx-side">
        <article className="mx-card mx-card--manager">
          <span className="mx-card__role"><Headphones size={12} /> Account manager</span>
          <div className="mx-card__person"><Avatar name={manager?.name || 'Team WowStampa'} profileId={manager?.id || null} size={58} /><div><strong>{manager?.name || 'Team WowStampa'}</strong><small>Il tuo riferimento in WowStampa</small></div></div>
          <div><h4>Scrivi per</h4><div className="mx-topics"><span><Package size={12} /> Ordini</span><span><Receipt size={12} /> Preventivi</span><span><Coins size={12} /> Crediti</span><span><Crown size={12} /> Abbonamento</span></div></div>
          {actions(manager, manager?.phone ? <a className="is-main" href={whatsappLink(manager.phone)} rel="noreferrer" target="_blank"><Phone size={15} /> WhatsApp</a> : null)}
        </article>
        <article className="mx-card mx-card--designer">
          <span className="mx-card__role"><Palette size={12} /> Grafico dedicato</span>
          <div className="mx-card__person"><Avatar name={designer?.name || 'In assegnazione'} profileId={designer?.id || null} size={58} /><div><strong>{designer?.name || 'In assegnazione'}</strong><small>{designer ? 'Segue le tue grafiche' : 'Ti assegneremo un grafico con la tua prima richiesta'}</small></div></div>
          <div><h4>Si occupa di</h4><div className="mx-topics"><span><BadgeCheck size={12} /> Revisioni</span><span><Pencil size={12} /> Modifiche</span><span><Sparkles size={12} /> Creazioni</span></div></div>
          {designer ? <div className="mx-work"><span>Richieste grafiche in lavorazione</span><b>{designerWork}</b></div> : null}
          {actions(designer, <Link className="is-main" href="/dashboard/richieste?new=grafica"><Plus size={15} /> Nuova grafica</Link>)}
        </article>
      </aside>
    </div>
  </main></>;
}

function whatsappLink(phone: string) { const digits = phone.replace(/\D/g, ''); return `https://wa.me/${digits.startsWith('39') || digits.length > 10 ? digits : `39${digits}`}`; }


async function RequestsPage() {
  const profile = await requireProfile(['client']);
  const supabase = await createClient();
  // Requests, company, balance and quotes are independent: read them in parallel.
  const [{data: requests}, {data: company}, quotes] = await Promise.all([
    supabase.from('graphic_requests').select('id,public_id,title,brief,status,type,credit_cost,created_at').order('created_at', {ascending: false}),
    supabase.from('companies').select('airtable_record_id').eq('id', profile.company_id || '').maybeSingle(),
    listQuotes(profile).catch((error) => { console.error('[Quotes]', error); return []; }),
  ]);
  const requestIds = (requests || []).map((request) => request.id);
  const [balance, filesByRequest, messagesResult] = await Promise.all([
    company?.airtable_record_id ? getWowproClient(company.airtable_record_id, {fresh: true}).then((record) => ({included: Number(record.fields.crediti_inclusi_residui || 0), extra: Number(record.fields.crediti_extra_residui || 0)})).catch(() => ({included: 0, extra: 0})) : Promise.resolve({included: 0, extra: 0}),
    listRequestFiles(requestIds, {customerVisibleOnly: true}),
    requestIds.length ? supabase.from('request_messages').select('id,request_id,body,created_at').in('request_id', requestIds).order('created_at', {ascending: true}) : Promise.resolve({data: [], error: null}),
  ]);
  const includedCredits = balance.included; const extraCredits = balance.extra;
  const messagesByRequest = new Map<string, Array<{id: string; body: string; created_at: string}>>();
  if (!messagesResult.error) for (const message of (messagesResult.data || []) as Array<{id: string; request_id: string; body: string; created_at: string}>) messagesByRequest.set(message.request_id, [...(messagesByRequest.get(message.request_id) || []), message]);
  const workspaceRequests = (requests || []).map((request) => ({id: request.id, publicId: request.public_id, title: request.title, brief: request.brief, status: request.status, type: request.type, creditCost: request.credit_cost, createdAt: request.created_at, messages: (messagesByRequest.get(request.id) || []).map((message) => ({id: message.id, body: message.body, createdAt: message.created_at})), files: filesByRequest.get(request.id) || []}));
  return <><PageHeader eyebrow="WOWPRO · Area cliente" title="Richieste" /><main className="page-content"><RequestsHub extraCredits={extraCredits} includedCredits={includedCredits} quotes={quotes} requests={workspaceRequests} /></main></>;
}

function number(value: number) { return new Intl.NumberFormat('it-IT', {useGrouping: 'always'} as Intl.NumberFormatOptions).format(value); }
function date(value: string) { return new Intl.DateTimeFormat('it-IT', {day: '2-digit', month: 'short', year: 'numeric'}).format(new Date(value)); }
