import {PageHeader} from '@/components/app-shell';
import {listWowproClients, type AirtableWowproClient} from '@/lib/integrations/airtable';
import {AdminClientDirectory, type AdminClient} from '@/components/admin-client-directory';
import {AdminCreditLedger, type CreditLedgerEntry} from '@/components/admin-credit-ledger';
import {AdminRequestBoard, type AdminGraphicRequest} from '@/components/admin-request-board';
import {AdminFeedbackBoard, type AdminFeedback} from '@/components/admin-feedback-board';
import {createAdminClient} from '@/lib/supabase/admin.server';
import {requireProfile} from '@/lib/auth';
import {AdminTeamDirectory, type TeamOperator} from '@/components/admin-team-directory';
import {AdminFileStorage} from '@/components/admin-file-storage';
import {getFileStorageSummary} from '@/lib/file-archive';
import {ARCHIVE_AFTER_DAYS, STORAGE_LIMIT_BYTES, listRequestFiles} from '@/lib/request-files';

const titles: Record<string, string> = {
  clienti: 'Clienti',
  'archivio-clienti': 'Archivio clienti',
  richieste: 'Richieste',
  crediti: 'Crediti',
  feedback: 'Feedback & idee',
};

export default async function AdminSectionPage({params}: {params: Promise<{section: string}>}) {
  const {section} = await params;
  const title = titles[section] || 'Back-office';

  if (section === 'clienti') return <ClientsPage archived={false} />;
  if (section === 'archivio-clienti') return <ClientsPage archived />;
  if (section === 'crediti') return <CreditsPage />;
  if (section === 'richieste') return <RequestsPage />;
  if (section === 'feedback') return <FeedbackPage />;
  if (section === 'team-ruoli') return <TeamRolesPage />;

  return (
    <>
      <PageHeader eyebrow="WowStampa · Programma WOWPRO" title={title} />
      <main className="page-content">
        <section className="empty-card empty-card--section">
          <span className="eyebrow">MODULO IN PREPARAZIONE</span>
          <h2>{title}</h2>
          <p>La struttura amministrativa è pronta per il collegamento ai dati operativi.</p>
        </section>
      </main>
    </>
  );
}

async function TeamRolesPage() {
  await requireProfile(['admin']);
  let operators: TeamOperator[] = [];
  let hasLoadError = false;
  try {
    const {data, error} = await createAdminClient().from('profiles').select('id,email,full_name,role,status,created_at').order('full_name');
    if (error) throw error;
    operators = (data || []).filter((operator) => ['admin', 'staff', 'graphic_operator'].includes(operator.role)).map((operator) => ({id: operator.id, email: operator.email, fullName: operator.full_name || operator.email, role: operator.role, status: operator.status, createdAt: operator.created_at}));
  } catch (error) { console.error('[Team directory]', error); hasLoadError = true; }
  return <><PageHeader eyebrow="WowStampa · Amministrazione" title="Team & ruoli" /><main className="page-content">{hasLoadError ? <section className="empty-card empty-card--section"><span className="eyebrow">REGISTRO NON DISPONIBILE</span><h2>Impossibile caricare il team</h2><p>Verifica la configurazione Supabase del servizio e riprova.</p></section> : <AdminTeamDirectory initialOperators={operators} />}</main></>;
}

async function FeedbackPage() {
  let feedback: AdminFeedback[] = [];
  let hasLoadError = false;
  try {
    const admin = createAdminClient();
    const [{data, error}, {data: voteRows, error: votesError}] = await Promise.all([
      admin.from('feedback').select('id,public_id,category,title,description,status,public_response,internal_note,created_at,companies(name),author:author_id(full_name,email)').order('created_at', {ascending: false}),
      admin.from('feedback_votes').select('feedback_id'),
    ]);
    if (error || votesError) throw error || votesError;
    const votesByFeedback = (voteRows || []).reduce<Record<string, number>>((counts, vote) => ({...counts, [vote.feedback_id]: (counts[vote.feedback_id] || 0) + 1}), {});
    feedback = (data || []).map((item) => {
      const company = asRecord(item.companies);
      const author = asRecord(item.author);
      return {id: item.id, publicId: item.public_id, companyName: stringValue(company.name, 'Cliente WOWPRO'), authorName: stringValue(author.full_name, stringValue(author.email, 'Utente cliente')), category: item.category, title: item.title, description: item.description, status: item.status, publicResponse: item.public_response || '', internalNote: item.internal_note || '', votes: votesByFeedback[item.id] || 0, createdAt: item.created_at};
    });
  } catch (error) {
    console.error('[Feedback board]', error);
    hasLoadError = true;
  }
  return <><PageHeader eyebrow="WowStampa · Programma WOWPRO" title="Feedback & idee" /><main className="page-content">{hasLoadError ? <section className="empty-card empty-card--section"><span className="eyebrow">REGISTRO NON DISPONIBILE</span><h2>Impossibile caricare i feedback</h2><p>Verifica la configurazione Supabase del servizio e riprova.</p></section> : <AdminFeedbackBoard initialFeedback={feedback} />}</main></>;
}

async function RequestsPage() {
  let requests: AdminGraphicRequest[] = [];
  let clients: {recordId: string; companyName: string}[] = [];
  let graphicOperators: {id: string; name: string}[] = [];
  let storage: Awaited<ReturnType<typeof getFileStorageSummary>> | null = null;
  let hasLoadError = false;
  try {
    const admin = createAdminClient();
    const [{data, error}, airtableClients, {data: operatorRows, error: operatorsError}] = await Promise.all([
      admin
      .from('graphic_requests')
      .select('id,public_id,title,brief,type,status,credit_cost,created_at,companies(name),requester:requested_by(full_name,email)')
      .order('created_at', {ascending: false}),
      listWowproClients(),
      admin.from('profiles').select('id,full_name,email,role').eq('status', 'active').order('full_name'),
    ]);
    if (error || operatorsError) throw error || operatorsError;
    clients = airtableClients
      .filter(({fields}) => !fields.archiviato)
      .map(({id, fields}) => ({recordId: id, companyName: fields.ragione_sociale || fields.cliente_id || 'Cliente WOWPRO'}));
    graphicOperators = (operatorRows || []).filter((operator) => operator.role === 'graphic_operator').map((operator) => ({id: operator.id, name: operator.full_name || operator.email}));
    const filesByRequest = await listRequestFiles((data || []).map((graphicRequest) => graphicRequest.id));
    try { storage = await getFileStorageSummary(); } catch (storageError) { console.error('[File storage summary]', storageError); }
    requests = (data || []).map((graphicRequest) => {
      const company = asRecord(graphicRequest.companies);
      const requester = asRecord(graphicRequest.requester);
      return {
        id: graphicRequest.id,
        publicId: graphicRequest.public_id,
        companyName: stringValue(company.name, 'Cliente WOWPRO'),
        requesterName: stringValue(requester.full_name, stringValue(requester.email, 'Utente cliente')),
        title: graphicRequest.title,
        brief: graphicRequest.brief,
        type: graphicRequest.type,
        status: graphicRequest.status,
        creditCost: graphicRequest.credit_cost,
        createdAt: graphicRequest.created_at,
        files: filesByRequest.get(graphicRequest.id) || [],
      };
    });
  } catch (error) {
    console.error('[Request board]', error);
    hasLoadError = true;
  }

  return <>
    <PageHeader eyebrow="WowStampa · Programma WOWPRO" title="Richieste" />
    <main className="page-content">
      {hasLoadError ? <section className="empty-card empty-card--section"><span className="eyebrow">REGISTRO NON DISPONIBILE</span><h2>Impossibile caricare le richieste</h2><p>Verifica la configurazione Supabase del servizio e riprova.</p></section> : <>{storage ? <AdminFileStorage archivableBytes={storage.archivable.reduce((total, file) => total + file.size, 0)} archivableIds={storage.archivable.map((file) => file.id)} archiveAfterDays={ARCHIVE_AFTER_DAYS} fileCount={storage.fileCount} limitBytes={STORAGE_LIMIT_BYTES} usedBytes={storage.usedBytes} /> : null}<AdminRequestBoard clients={clients} graphicOperators={graphicOperators} initialRequests={requests} /></>}
    </main>
  </>;
}

async function CreditsPage() {
  let entries: CreditLedgerEntry[] = [];
  let hasLoadError = false;
  try {
    const admin = createAdminClient();
    const {data, error} = await admin
      .from('credit_transactions')
      .select('id,bucket,amount,description,created_at,companies(name),profiles:created_by(full_name,email)')
      .order('created_at', {ascending: false});
    if (error) throw error;
    entries = (data || []).map((transaction) => {
      const company = asRecord(transaction.companies);
      const operator = asRecord(transaction.profiles);
      return {
        id: transaction.id,
        bucket: transaction.bucket,
        amount: transaction.amount,
        description: transaction.description,
        createdAt: transaction.created_at,
        companyName: stringValue(company.name, 'Cliente WOWPRO'),
        createdBy: stringValue(operator.full_name, stringValue(operator.email, 'Operatore WOWPRO')),
      };
    });
  } catch (error) {
    console.error('[Credit ledger]', error);
    hasLoadError = true;
  }

  return <>
    <PageHeader eyebrow="WowStampa · Programma WOWPRO" title="Crediti" />
    <main className="page-content">
      {hasLoadError ? <section className="empty-card empty-card--section"><span className="eyebrow">REGISTRO NON DISPONIBILE</span><h2>Impossibile caricare i movimenti</h2><p>Verifica la configurazione Supabase del servizio e riprova.</p></section> : <AdminCreditLedger entries={entries} />}
    </main>
  </>;
}

async function ClientsPage({archived}: {archived: boolean}) {
  let clients: AdminClient[] = [];
  let hasLoadError = false;
  try {
    const records = await listWowproClients();
    clients = records.map(({id, fields}) => toAdminClient(id, fields));
  } catch {
    hasLoadError = true;
  }

  return (
    <>
      <PageHeader eyebrow="WowStampa · Programma WOWPRO" title={archived ? 'Archivio clienti' : 'Clienti'} />
      <main className="page-content">
        {hasLoadError ? <section className="empty-card empty-card--section">
          <span className="eyebrow">COLLEGAMENTO NON DISPONIBILE</span>
          <h2>Impossibile caricare i clienti</h2>
          <p>Verifica le credenziali Airtable configurate nel servizio e riprova.</p>
        </section> : <AdminClientDirectory archived={archived} initialClients={clients} />}
      </main>
    </>
  );
}

function toAdminClient(recordId: string, fields: AirtableWowproClient): AdminClient {
  return {
    recordId,
    clientId: fields.cliente_id || 'SENZA ID',
    companyName: fields.ragione_sociale || 'Azienda senza nome',
    email: fields.email_login || 'Email non disponibile',
    plan: fields.piano || '',
    subscriptionStatus: fields.stato_abbonamento || '',
    accountManager: fields.account_manager_nome || '',
    shopifyCustomerId: fields.shopify_customer_id || '',
    includedCredits: Number(fields.crediti_inclusi_residui || 0),
    extraCredits: Number(fields.crediti_extra_residui || 0),
    renewalDate: fields.data_rinnovo_piano || '',
    isArchived: Boolean(fields.archiviato),
  };
}

function asRecord(value: unknown) { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function stringValue(value: unknown, fallback: string) { return typeof value === 'string' && value.trim() ? value : fallback; }
