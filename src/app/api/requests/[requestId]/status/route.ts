import {NextResponse} from 'next/server';
import {z} from 'zod';

import {getCurrentProfile} from '@/lib/auth';
import {getAccessibleRequest} from '@/lib/request-files';
import {STATUS_LABELS, isTeam, logRequestEvent, notifyRequestUpdate, type RequestStatus} from '@/lib/request-thread';
import {createAdminClient} from '@/lib/supabase/admin.server';

const schema = z.object({
  action: z.enum(['start', 'send_review', 'complete', 'reopen', 'reject', 'approve', 'request_changes']),
  comment: z.string().trim().max(2000).optional(),
});

type Rule = {to: RequestStatus; from?: RequestStatus[]; who: 'team' | 'manager' | 'client'; event: string; text: (name: string) => string; notify?: string};
const RULES: Record<z.infer<typeof schema>['action'], Rule> = {
  start: {to: 'in_progress', from: ['new'], who: 'team', event: 'status_in_progress', text: (name) => `${name} ha preso in carico la richiesta.`},
  send_review: {to: 'review', from: ['new', 'in_progress'], who: 'team', event: 'status_review', text: (name) => `${name} ha inviato una bozza da approvare.`, notify: 'La bozza è pronta: guardala e approvala o chiedi modifiche'},
  complete: {to: 'completed', who: 'team', event: 'status_completed', text: (name) => `${name} ha segnato la richiesta come completata.`, notify: 'La tua richiesta è stata completata'},
  reopen: {to: 'in_progress', from: ['review', 'completed', 'rejected'], who: 'team', event: 'status_reopened', text: (name) => `${name} ha riaperto la richiesta.`},
  reject: {to: 'rejected', who: 'manager', event: 'status_rejected', text: (name) => `${name} ha rifiutato la richiesta.`, notify: 'La tua richiesta non può essere lavorata'},
  approve: {to: 'completed', from: ['review'], who: 'client', event: 'client_approved', text: (name) => `${name} ha approvato la bozza.`, notify: 'Il cliente ha approvato la bozza'},
  request_changes: {to: 'in_progress', from: ['review'], who: 'client', event: 'client_changes', text: (name) => `${name} ha chiesto delle modifiche.`, notify: 'Il cliente ha chiesto delle modifiche'},
};

export async function POST(request: Request, {params}: {params: Promise<{requestId: string}>}) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({error: 'Non autenticato.'}, {status: 401});
  const {requestId} = await params;
  if (!(await getAccessibleRequest(profile, requestId))) return NextResponse.json({error: 'Richiesta non trovata.'}, {status: 404});
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({error: 'Azione non valida.'}, {status: 400});
  const rule = RULES[parsed.data.action];

  const allowed = rule.who === 'client' ? profile.role === 'client' : rule.who === 'manager' ? profile.role === 'staff' || profile.role === 'admin' : isTeam(profile);
  if (!allowed) return NextResponse.json({error: 'Non puoi eseguire questa azione.'}, {status: 403});
  if (parsed.data.action === 'request_changes' && !parsed.data.comment) return NextResponse.json({error: 'Descrivi le modifiche che ti servono.'}, {status: 400});

  const admin = createAdminClient();
  const {data: current} = await admin.from('graphic_requests').select('status').eq('id', requestId).single();
  if (rule.from && current && !rule.from.includes(current.status as RequestStatus)) {
    return NextResponse.json({error: `La richiesta è "${STATUS_LABELS[current.status as RequestStatus] || current.status}": azione non disponibile.`}, {status: 409});
  }

  const now = new Date().toISOString();
  const {error} = await admin.from('graphic_requests').update({status: rule.to, completed_at: rule.to === 'completed' ? now : null, awaiting_client_response: rule.to === 'review', updated_at: now}).eq('id', requestId);
  if (error) {
    console.error('[Request status]', error);
    const missingReview = rule.to === 'review' && /enum|invalid input value/i.test(error.message);
    return NextResponse.json({error: missingReview ? 'Lo stato "Bozza da approvare" non è ancora attivo nel database.' : 'Stato non aggiornato. Riprova.'}, {status: 502});
  }

  const name = profile.full_name || profile.email;
  await logRequestEvent(requestId, profile.id, rule.event, rule.text(name));
  if (parsed.data.comment) await admin.from('request_messages').insert({request_id: requestId, author_id: profile.id, body: parsed.data.comment, customer_visible: true});
  if (rule.notify) {
    await notifyRequestUpdate({requestId, actor: profile, subject: rule.notify, message: parsed.data.comment || rule.text(name), force: true}).catch((notifyError) => console.error('[Request notify]', notifyError));
  }
  return NextResponse.json({status: rule.to});
}
