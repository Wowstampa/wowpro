import 'server-only';

import {escapeHtml, sendEmail} from '@/lib/email';
import {filterByPreference} from '@/lib/notification-prefs';
import {createAdminClient} from '@/lib/supabase/admin.server';

type Idea = {id: string; title: string; description?: string; category?: string};
const STATUS_TEXT: Record<string, string> = {new: 'è stata ricevuta', evaluating: 'è in valutazione', implementing: 'è in sviluppo', completed: 'è stata rilasciata', rejected: 'non è in programma per ora'};
const origin = () => (process.env.NEXT_PUBLIC_APP_URL || 'https://wowpro.it').replace(/\/$/, '');

function layout(eyebrow: string, title: string, body: string, link: string, cta: string) {
  return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#0a0d15"><p style="font-size:12px;letter-spacing:.08em;color:#11823f;font-weight:bold">${escapeHtml(eyebrow)}</p><h2 style="margin:0 0 12px">${escapeHtml(title)}</h2><blockquote style="margin:0 0 20px;padding:12px 16px;border-left:4px solid #1db65b;background:#f6f9fb;color:#3a4556">${escapeHtml(body).replace(/\n/g, '<br>')}</blockquote><a href="${link}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#1db65b;color:#fff;text-decoration:none;font-weight:bold">${escapeHtml(cta)}</a></div>`;
}

// A client proposed an idea: the admins get an email to review it.
export async function notifyNewIdea(idea: Idea & {author: string}) {
  const {data} = await createAdminClient().from('profiles').select('id,email').eq('role', 'admin').eq('status', 'active');
  const link = `${origin()}/admin/feedback`;
  const subject = `Nuova idea da ${idea.author}: ${idea.title}`;
  const body = `${idea.category ? `[${idea.category}] ` : ''}${idea.description || ''}`;
  for (const recipient of data || []) {
    try { await sendEmail({to: recipient.email, subject, html: layout('WOWPRO · FEEDBACK & IDEE', subject, body, link, 'Valuta l’idea'), text: `${subject}\n\n${body}\n\n${link}`}); } catch (error) { console.error('[Idea email]', error); }
  }
}

// The team moved an idea forward or replied: its author and everyone who voted it hear about it.
export async function notifyIdeaUpdate(idea: Idea, change: {status?: string; response?: string}) {
  const admin = createAdminClient();
  const [{data: row}, {data: votes}] = await Promise.all([
    admin.from('feedback').select('author_id').eq('id', idea.id).maybeSingle(),
    admin.from('feedback_votes').select('voter_id').eq('feedback_id', idea.id),
  ]);
  const ids = [...new Set([row?.author_id, ...(votes || []).map((vote) => vote.voter_id)].filter(Boolean) as string[])];
  if (!ids.length) return;
  const {data: people} = await admin.from('profiles').select('id,email,role,status').in('id', ids).eq('role', 'client').eq('status', 'active');
  const link = `${origin()}/dashboard/feedback`;
  const subject = change.status ? `La tua idea ${STATUS_TEXT[change.status] || 'è stata aggiornata'}` : 'WowStampa ha risposto alla tua idea';
  const body = [`«${idea.title}»`, change.response ? `WowStampa: ${change.response}` : ''].filter(Boolean).join('\n\n');
  for (const recipient of await filterByPreference((people || []) as Array<{id: string; email: string}>, 'idee')) {
    const mine = recipient.id === row?.author_id;
    const title = mine ? subject : subject.replace('La tua idea', 'Un’idea che hai votato').replace('alla tua idea', 'a un’idea che hai votato');
    try { await sendEmail({to: recipient.email, subject: title, html: layout('WOWPRO · FEEDBACK & IDEE', title, body, link, 'Vedi la bacheca'), text: `${title}\n\n${body}\n\n${link}`}); } catch (error) { console.error('[Idea update email]', error); }
  }
}
