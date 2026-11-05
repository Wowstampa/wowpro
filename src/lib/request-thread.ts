import 'server-only';

import type {CurrentProfile} from '@/lib/auth';
import {escapeHtml, sendEmail} from '@/lib/email';
import {createAdminClient} from '@/lib/supabase/admin.server';

export type RequestStatus = 'new' | 'in_progress' | 'review' | 'completed' | 'rejected';
export const STATUS_LABELS: Record<RequestStatus, string> = {new: 'Nuova', in_progress: 'In lavorazione', review: 'Bozza da approvare', completed: 'Completata', rejected: 'Rifiutata'};
const TYPE_LABELS: Record<string, string> = {revision: 'Revisione', modification: 'Modifica', creation: 'Creazione'};
const EMAIL_INTERVAL_MS = 15 * 60_000;

export type TimelineItem =
  | {kind: 'comment'; id: string; at: string; body: string; internal: boolean; authorName: string; fromClient: boolean; mine: boolean}
  | {kind: 'event'; id: string; at: string; text: string; tone: string; authorName: string}
  | {kind: 'file'; id: string; at: string; name: string; size: number; authorName: string; fromClient: boolean};

type Person = {full_name?: string | null; email?: string | null; role?: string | null};
const one = <T,>(value: T | T[] | null | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;
const nameOf = (person: Person | null, fallback = 'Utente') => person?.full_name || person?.email || fallback;

export function isTeam(profile: CurrentProfile) { return profile.role === 'staff' || profile.role === 'admin' || profile.role === 'graphic_operator'; }

export async function getRequestThread(profile: CurrentProfile, requestId: string) {
  const admin = createAdminClient();
  const team = isTeam(profile);
  const [{data: request}, {data: events}, {data: messages}, {data: files}] = await Promise.all([
    admin.from('graphic_requests').select('id,public_id,title,brief,type,status,credit_cost,created_at,completed_at,due_date,priority,awaiting_client_response,companies(name),requester:requested_by(full_name,email),designer:assigned_to(full_name,email)').eq('id', requestId).maybeSingle(),
    admin.from('request_events').select('id,event_type,public_message,internal_note,created_at,actor:actor_id(full_name,email,role)').eq('request_id', requestId).not('event_type', 'like', 'email:%').order('created_at'),
    admin.from('request_messages').select('id,body,customer_visible,created_at,author_id,author:author_id(full_name,email,role)').eq('request_id', requestId).order('created_at'),
    admin.from('request_files').select('id,file_name,size_bytes,created_at,customer_visible,uploader:uploaded_by(full_name,email,role)').eq('request_id', requestId).order('created_at'),
  ]);
  if (!request) return null;

  const timeline: TimelineItem[] = [];
  for (const event of events || []) {
    const text = team ? event.public_message || event.internal_note : event.public_message;
    if (!text) continue;
    timeline.push({kind: 'event', id: event.id, at: event.created_at, text, tone: eventTone(event.event_type), authorName: nameOf(one(event.actor) as Person | null, 'WowStampa')});
  }
  for (const message of messages || []) {
    if (!team && !message.customer_visible) continue;
    const author = one(message.author) as Person | null;
    timeline.push({kind: 'comment', id: message.id, at: message.created_at, body: message.body, internal: !message.customer_visible, authorName: nameOf(author), fromClient: author?.role === 'client', mine: message.author_id === profile.id});
  }
  for (const file of files || []) {
    if (!team && !file.customer_visible) continue;
    const uploader = one(file.uploader) as Person | null;
    timeline.push({kind: 'file', id: file.id, at: file.created_at, name: file.file_name, size: Number(file.size_bytes || 0), authorName: nameOf(uploader), fromClient: uploader?.role === 'client'});
  }
  timeline.sort((a, b) => a.at.localeCompare(b.at));

  const company = one(request.companies) as {name?: string} | null;
  const requester = one(request.requester) as Person | null;
  const designer = one(request.designer) as Person | null;
  return {
    request: {
      id: request.id, publicId: request.public_id, title: request.title, brief: request.brief, type: TYPE_LABELS[request.type] || request.type,
      status: request.status as RequestStatus, creditCost: request.credit_cost, createdAt: request.created_at, completedAt: request.completed_at,
      dueDate: request.due_date, priority: request.priority, awaitingClient: request.awaiting_client_response,
      companyName: company?.name || 'Cliente', requesterName: nameOf(requester, 'Cliente'), designerName: designer ? nameOf(designer) : null,
    },
    files: (files || []).filter((file) => team || file.customer_visible).map((file) => ({id: file.id, name: file.file_name, size: Number(file.size_bytes || 0), createdAt: file.created_at})),
    timeline,
  };
}

function eventTone(type: string) {
  if (type.includes('review')) return 'review';
  if (type.includes('approved') || type.includes('completed')) return 'done';
  if (type.includes('changes') || type.includes('rejected')) return 'warn';
  return 'info';
}

export async function logRequestEvent(requestId: string, actorId: string, eventType: string, publicMessage: string | null, internalNote: string | null = null) {
  const {error} = await createAdminClient().from('request_events').insert({request_id: requestId, actor_id: actorId, event_type: eventType, public_message: publicMessage, internal_note: internalNote});
  if (error) console.error('[Request event]', error);
}

// Emails the other side of the request: the client's users, or the designer (admins when nobody is assigned).
export async function notifyRequestUpdate({requestId, actor, subject, message, force = false}: {requestId: string; actor: CurrentProfile; subject: string; message: string; force?: boolean}) {
  const admin = createAdminClient();
  const {data: request} = await admin.from('graphic_requests').select('id,public_id,title,company_id,assigned_to').eq('id', requestId).maybeSingle();
  if (!request) return;
  const origin = (process.env.NEXT_PUBLIC_APP_URL || 'https://wowpro.it').replace(/\/$/, '');
  type Recipient = {id: string; email: string; link: string};
  let recipients: Recipient[] = [];
  if (actor.role === 'client') {
    if (request.assigned_to) {
      const {data} = await admin.from('profiles').select('id,email').eq('id', request.assigned_to).eq('status', 'active');
      recipients = (data || []).map((row) => ({id: row.id, email: row.email, link: `${origin}/operatore/richieste?r=${request.id}`}));
    } else {
      const {data} = await admin.from('profiles').select('id,email').eq('role', 'admin').eq('status', 'active');
      recipients = (data || []).map((row) => ({id: row.id, email: row.email, link: `${origin}/admin/richieste?r=${request.id}`}));
    }
  } else {
    const {data} = await admin.from('profiles').select('id,email').eq('role', 'client').eq('status', 'active').eq('company_id', request.company_id);
    recipients = (data || []).map((row) => ({id: row.id, email: row.email, link: `${origin}/dashboard/richieste?r=${request.id}`}));
  }
  recipients = recipients.filter((recipient) => recipient.id !== actor.id);
  for (const recipient of recipients) {
    const marker = `email:${recipient.id}`;
    if (!force) {
      const {data: last} = await admin.from('request_events').select('created_at').eq('request_id', request.id).eq('event_type', marker).order('created_at', {ascending: false}).limit(1).maybeSingle();
      if (last && Date.now() - new Date(last.created_at).getTime() < EMAIL_INTERVAL_MS) continue;
    }
    const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#0a0d15"><p style="font-size:12px;letter-spacing:.08em;color:#11823f;font-weight:bold">WOWPRO · RICHIESTA ${escapeHtml(request.public_id)}</p><h2 style="margin:0 0 6px">${escapeHtml(subject)}</h2><p style="margin:0 0 14px;color:#5b6575">${escapeHtml(request.title)}</p><blockquote style="margin:0 0 20px;padding:12px 16px;border-left:4px solid #1db65b;background:#f6f9fb;color:#3a4556">${escapeHtml(message).replace(/\n/g, '<br>')}</blockquote><a href="${recipient.link}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#1db65b;color:#fff;text-decoration:none;font-weight:bold">Apri la richiesta</a></div>`;
    try {
      if (await sendEmail({to: recipient.email, subject: `${subject} · ${request.public_id}`, html, text: `${subject}\n${request.title}\n\n${message}\n\nApri la richiesta: ${recipient.link}`})) {
        await admin.from('request_events').insert({request_id: request.id, actor_id: actor.id, event_type: marker, internal_note: null, public_message: null});
      }
    } catch (error) { console.error('[Request email]', error); }
  }
}
