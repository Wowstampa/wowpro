import Link from 'next/link';
import {BadgeCheck, CreditCard, Info, Mail, MessageSquareText, Palette, Pencil, Phone, Sparkles} from 'lucide-react';

import {PageHeader} from '@/components/app-shell';
import {ClientRequestsWorkspace} from '@/components/client-requests-workspace';
import {ClientOrders} from '@/components/client-orders';
import {CreditPurchase} from '@/components/credit-purchase';
import {OpenChatButton} from '@/components/support-widget';
import {getConversationCompany} from '@/lib/support';
import {createAdminClient} from '@/lib/supabase/admin.server';
import {requireProfile} from '@/lib/auth';
import {getWowproClient} from '@/lib/integrations/airtable';
import {listCustomerOrders, type CustomerOrder} from '@/lib/integrations/shopify';
import {listRequestFiles} from '@/lib/request-files';
import {createClient} from '@/lib/supabase/server';

const titles: Record<string, string> = {crediti: 'Crediti', richieste: 'Richieste grafiche', ordini: 'Ordini', supporto: 'Supporto', feedback: 'Feedback & idee'};

export default async function ClientSectionPage({params}: {params: Promise<{section: string}>}) {
  const {section} = await params;
  if (section === 'crediti') return <CreditsPage />;
  if (section === 'richieste') return <RequestsPage />;
  if (section === 'ordini') return <OrdersPage />;
  if (section === 'supporto') return <SupportPage />;
  const title = titles[section] || 'WOWPRO';
  return <><PageHeader eyebrow="WOWPRO · Area cliente" title={title} /><main className="page-content"><section className="empty-card empty-card--section"><span className="eyebrow">IN PREPARAZIONE</span><h2>{title}</h2><p>Questo spazio verrà collegato ai dati del tuo account.</p></section></main></>;
}

async function CreditsPage() {
  const profile = await requireProfile(['client']);
  const supabase = await createClient();
  const [{data: company}, {data: transactions}] = await Promise.all([supabase.from('companies').select('airtable_record_id').eq('id', profile.company_id || '').maybeSingle(), supabase.from('credit_transactions').select('id,bucket,amount,description,created_at').order('created_at', {ascending: false})]);
  let included = 0; let extra = 0; let monthly = 0; let renewal = '';
  if (company?.airtable_record_id) { try { const record = await getWowproClient(company.airtable_record_id, {fresh: true}); included = Number(record.fields.crediti_inclusi_residui || 0); extra = Number(record.fields.crediti_extra_residui || 0); monthly = Number(record.fields.crediti_inclusi_mese || 0); renewal = record.fields.data_rinnovo_piano || ''; } catch { /* Balances are temporarily unavailable. */ } }
  const ledger = (transactions || []).reduce<{rows: Array<{id: string; bucket: string; amount: number; description: string; created_at: string; balance: number}>; runningBalance: number}>((state, transaction) => ({
    rows: [...state.rows, {...transaction, balance: state.runningBalance}],
    runningBalance: state.runningBalance - transaction.amount,
  }), {rows: [], runningBalance: included + extra}).rows;
  const used = Math.max(monthly - included, 0);
  return <><PageHeader eyebrow="WOWPRO · Area cliente" title="Crediti" action={<div className="credit-chip"><i /> <strong>{number(included + extra)}</strong> crediti disponibili</div>} /><main className="page-content credits-page">
    <section className="credits-hero"><article className="credits-hero__included"><span className="credits-hero__label"><i /> CREDITI INCLUSI</span><div><strong>{number(included)}</strong><b>{monthly ? ` / ${number(monthly)}` : ''}</b></div><p>{renewal ? `Rinnovo automatico il ${date(renewal)}` : 'Rinnovo mensile del piano'}</p><div className="credits-progress"><i style={{width: monthly ? `${Math.min(included / monthly, 1) * 100}%` : '0%'}} /></div><div className="credits-hero__summary"><span>Consumati: <b>{number(used)}</b></span><span>{monthly ? `${Math.round(included / monthly * 100)}% disponibile` : 'Piano da configurare'}</span></div><div className="credits-hero__note"><Info size={15} /><p>I crediti inclusi <b>si resettano ogni mese e non sono cumulabili</b>: vengono sempre consumati per primi.</p></div></article><article className="credits-hero__extra"><span className="credits-hero__label"><i /> CREDITI EXTRA</span><strong>{number(extra)}</strong><p>I crediti extra <b>non scadono e non si azzerano</b> al reset mensile. Vengono usati solo dopo aver esaurito quelli inclusi.</p><CreditPurchase /></article></section>
    <section><div className="credits-section-title"><h2>Listino servizi grafici</h2><p>Costo in crediti per ogni tipo di richiesta</p></div><div className="service-price-grid"><Service icon={<BadgeCheck size={18} />} title="Revisione" text="Controllo file e piccole correzioni su un progetto esistente." credits="1.000" /><Service icon={<Pencil size={18} />} title="Modifica" text="Interventi sostanziali su grafica, testi o impaginazione." credits="2.000" /><Service icon={<Sparkles size={18} />} title="Creazione" text="Progettazione di una grafica nuova partendo da zero." credits="3.000" /></div></section>
    <section><div className="credits-section-title"><h2>Storico movimenti</h2></div><div className="credits-ledger"><div className="credits-ledger__head"><span>Data</span><span>Descrizione</span><span>Tipo</span><span>Crediti</span><span>Saldo</span></div>{ledger.map((transaction) => <div className="credits-ledger__row" key={transaction.id}><strong>{date(transaction.created_at)}</strong><span>{transaction.description}</span><span><i className={transaction.bucket === 'extra' ? 'ledger-tag ledger-tag--extra' : 'ledger-tag'}>{transaction.bucket === 'extra' ? 'Extra' : 'Inclusi'}</i></span><b className={transaction.amount > 0 ? 'positive' : 'negative'}>{transaction.amount > 0 ? '+' : ''}{number(transaction.amount)}</b><strong>{number(transaction.balance)}</strong></div>)}{!ledger.length ? <div className="credits-ledger__empty"><CreditCard size={20} /><strong>Nessun movimento</strong><p>Gli accrediti registrati dal team compariranno qui.</p></div> : null}</div></section>
  </main></>;
}

async function OrdersPage() {
  const profile = await requireProfile(['client']);
  const supabase = await createClient();
  const {data: company} = await supabase.from('companies').select('airtable_record_id,shopify_customer_id').eq('id', profile.company_id || '').maybeSingle();
  let orders: CustomerOrder[] = [];
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
  } catch (error) {
    console.error('[Client orders]', error);
    hasLoadError = true;
  }
  return <><PageHeader eyebrow="WOWPRO · Area cliente" title="Ordini" /><main className="page-content">{hasLoadError ? <section className="empty-card empty-card--section"><span className="eyebrow">COLLEGAMENTO NON DISPONIBILE</span><h2>Impossibile caricare gli ordini</h2><p>Riprova tra qualche istante. Se il problema continua, contatta il tuo account manager.</p></section> : <ClientOrders orders={orders} />}</main></>;
}

async function SupportPage() {
  const profile = await requireProfile(['client']);
  type Contact = {id: string; name: string; email: string; phone: string | null};
  let manager: Contact | null = null;
  let designer: Contact | null = null;
  let credits: number | null = null;
  if (profile.company_id) {
    try {
      const admin = createAdminClient();
      const company = await getConversationCompany(profile.company_id);
      if (company?.manager) manager = {...company.manager, phone: null};
      if (company?.airtable_record_id) {
        try { const record = await getWowproClient(company.airtable_record_id); credits = Number(record.fields.crediti_inclusi_residui || 0) + Number(record.fields.crediti_extra_residui || 0); } catch { /* Credits chip is optional. */ }
      }
      // The designer of the most recent request that has one assigned.
      const {data} = await admin.from('graphic_requests').select('assigned_to,designer:assigned_to(full_name,email)').eq('company_id', profile.company_id).not('assigned_to', 'is', null).order('created_at', {ascending: false}).limit(1).maybeSingle();
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
  return <><PageHeader eyebrow="WOWPRO · Area cliente" title="Supporto" action={credits !== null ? <div className="credit-chip"><i /> <strong>{number(credits)}</strong> crediti disponibili</div> : undefined} /><main className="page-content">
    <section>
      <div className="credits-section-title"><h2>Supporto WOWPRO</h2><p>Hai una linea diretta con il tuo team dedicato: account manager e grafico</p></div>
      <div className="support-contacts">
        <article className="support-card">
          <span className="support-card__label">IL TUO ACCOUNT MANAGER</span>
          <div className="support-card__person"><span className="support-card__avatar">{initials(manager?.name || 'WowStampa')}</span><div><h3>{manager?.name || 'Team WowStampa'}</h3><p>Account Manager dedicato · WOWPRO</p></div></div>
          <div className="support-card__rows">
            {manager ? <a className="support-card__row" href={`mailto:${manager.email}`}><span><Mail size={17} /></span><div><small>Email diretta</small><strong>{manager.email}</strong></div></a> : null}
            <OpenChatButton className="support-card__row"><span><MessageSquareText size={17} /></span><div><small>Chat dedicata</small><strong>Scrivici dal portale</strong></div></OpenChatButton>
            {manager?.phone ? <a className="support-card__row" href={whatsappLink(manager.phone)} rel="noreferrer" target="_blank"><span><Phone size={17} /></span><div><small>Telefono / WhatsApp</small><strong>{manager.phone}</strong></div></a> : null}
          </div>
          <footer className="support-card__foot"><p><b>Il tuo riferimento</b> per crediti, abbonamento, preventivi e ordini.</p></footer>
        </article>
        <article className="support-card support-card--designer">
          <span className="support-card__label">IL TUO GRAFICO DEDICATO</span>
          <div className="support-card__person"><span className="support-card__avatar">{designer ? initials(designer.name) : <Palette size={24} />}</span><div><h3>{designer?.name || 'In assegnazione'}</h3><p>Grafico dedicato · WOWPRO</p></div></div>
          <div className="support-card__rows">
            {designer ? <a className="support-card__row" href={`mailto:${designer.email}`}><span><Mail size={17} /></span><div><small>Email diretta</small><strong>{designer.email}</strong></div></a> : null}
            <Link className="support-card__row" href="/dashboard/richieste"><span><MessageSquareText size={17} /></span><div><small>Richieste grafiche</small><strong>Per brief e revisioni grafiche</strong></div></Link>
            {designer?.phone ? <a className="support-card__row" href={whatsappLink(designer.phone)} rel="noreferrer" target="_blank"><span><Phone size={17} /></span><div><small>Telefono / WhatsApp</small><strong>{designer.phone}</strong></div></a> : null}
          </div>
          <footer className="support-card__foot"><p><b>Lavorazioni grafiche:</b> revisioni, modifiche e creazioni.</p>{designer ? null : <p>Ti assegneremo un grafico dedicato con la tua prima richiesta.</p>}</footer>
        </article>
      </div>
    </section>
  </main></>;
}

function whatsappLink(phone: string) { const digits = phone.replace(/\D/g, ''); return `https://wa.me/${digits.startsWith('39') || digits.length > 10 ? digits : `39${digits}`}`; }

function initials(value: string) { return value.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }

async function RequestsPage() {
  const profile = await requireProfile(['client']);
  const supabase = await createClient();
  const {data: requests} = await supabase.from('graphic_requests').select('id,public_id,title,brief,status,type,credit_cost,created_at').order('created_at', {ascending: false});
  let includedCredits = 0; let extraCredits = 0;
  const {data: company} = await supabase.from('companies').select('airtable_record_id').eq('id', profile.company_id || '').maybeSingle();
  if (company?.airtable_record_id) { try { const record = await getWowproClient(company.airtable_record_id, {fresh: true}); includedCredits = Number(record.fields.crediti_inclusi_residui || 0); extraCredits = Number(record.fields.crediti_extra_residui || 0); } catch { /* The request form will show an unavailable balance. */ } }
  const requestIds = (requests || []).map((request) => request.id);
  const filesByRequest = await listRequestFiles(requestIds, {customerVisibleOnly: true});
  const messagesByRequest = new Map<string, Array<{id: string; body: string; created_at: string}>>();
  if (requestIds.length) {
    // The message log is optional until the graphic-workspace migration is applied.
    const {data: messages, error} = await supabase.from('request_messages').select('id,request_id,body,created_at').in('request_id', requestIds).order('created_at', {ascending: true});
    if (!error) for (const message of messages || []) messagesByRequest.set(message.request_id, [...(messagesByRequest.get(message.request_id) || []), message]);
  }
  const workspaceRequests = (requests || []).map((request) => ({id: request.id, publicId: request.public_id, title: request.title, brief: request.brief, status: request.status, type: request.type, creditCost: request.credit_cost, createdAt: request.created_at, messages: (messagesByRequest.get(request.id) || []).map((message) => ({id: message.id, body: message.body, createdAt: message.created_at})), files: filesByRequest.get(request.id) || []}));
  return <><PageHeader eyebrow="WOWPRO · Area cliente" title="Richieste grafiche" action={<div className="credit-chip"><i /> <strong>{number(includedCredits + extraCredits)}</strong> crediti disponibili</div>} /><main className="page-content"><ClientRequestsWorkspace extraCredits={extraCredits} includedCredits={includedCredits} requests={workspaceRequests} /></main></>;
}

function Service({credits, icon, text, title}: {credits: string; icon: React.ReactNode; text: string; title: string}) { return <article><span>{icon}</span><h3>{title}</h3><p>{text}</p><div><strong>{credits}</strong><small>crediti</small></div></article>; }
function number(value: number) { return new Intl.NumberFormat('it-IT').format(value); }
function date(value: string) { return new Intl.DateTimeFormat('it-IT', {day: '2-digit', month: 'short', year: 'numeric'}).format(new Date(value)); }
