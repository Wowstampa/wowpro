import {PageHeader} from '@/components/app-shell';
import {GraphicRequestBoard, type GraphicRequest} from '@/components/graphic-request-board';
import {requireProfile} from '@/lib/auth';
import {listRequestFiles} from '@/lib/request-files';
import {createAdminClient} from '@/lib/supabase/admin.server';

export default async function GraphicRequestsPage() {
  const profile = await requireProfile(['graphic_operator']);
  let requests: GraphicRequest[] = [];
  let hasLoadError = false;
  try {
    const admin = createAdminClient();
    const {data, error} = await admin.from('graphic_requests').select('id,public_id,title,brief,status,priority,due_date,created_at,awaiting_client_response,companies(name),requester:requested_by(full_name,email),request_messages(id,body,created_at)').eq('assigned_to', profile.id).order('due_date', {ascending: true, nullsFirst: false});
    if (error) throw error;
    const filesByRequest = await listRequestFiles((data || []).map((request) => request.id));
    requests = (data || []).map((request) => ({id: request.id, publicId: request.public_id, title: request.title, brief: request.brief, companyName: nameFrom(request.companies, 'Cliente WOWPRO'), contactName: nameFrom(request.requester, 'Referente cliente'), status: request.status, priority: request.priority, dueDate: request.due_date, createdAt: request.created_at, awaitingClientResponse: request.awaiting_client_response, messages: (request.request_messages || []).map((message) => ({id: message.id, body: message.body, createdAt: message.created_at})), files: filesByRequest.get(request.id) || []}));
  } catch (error) { console.error('[Graphic requests]', error); hasLoadError = true; }
  return <><PageHeader eyebrow="WowStampa · Operatore grafico" title="Richieste" /><main className="page-content">{hasLoadError ? <section className="empty-card empty-card--section"><span className="eyebrow">REGISTRO NON DISPONIBILE</span><h2>Impossibile caricare le richieste</h2><p>Riprova tra qualche istante.</p></section> : <GraphicRequestBoard initialRequests={requests} />}</main></>;
}

function nameFrom(value: unknown, fallback: string) { if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback; const record = value as Record<string, unknown>; const name = record.full_name || record.name || record.email; return typeof name === 'string' && name.trim() ? name : fallback; }
