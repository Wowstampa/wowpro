import 'server-only';

import type {CurrentProfile} from '@/lib/auth';
import {escapeHtml, sendEmail} from '@/lib/email';
import {listWowproClients} from '@/lib/integrations/airtable';
import {createAdminClient} from '@/lib/supabase/admin.server';

export type SupportMessage = {id: string; body: string; createdAt: string; authorName: string; fromClient: boolean; file: {name: string; size: number} | null};
export type SupportPerson = {id: string; name: string; email: string};
export type ConversationSummary = {companyId: string; companyName: string; accountManager: string; lastMessage: string; lastAt: string | null; unread: number};

const EMAIL_INTERVAL_MS = 15 * 60_000;

type CompanyRow = {id: string; name: string; airtable_record_id: string | null; account_manager_id: string | null};
type ProfileRow = {id: string; email: string; full_name: string | null; role: string; status: string; company_id: string | null};

function person(row: ProfileRow): SupportPerson { return {id: row.id, name: row.full_name || row.email, email: row.email}; }
const normalize = (value: string | null | undefined) => (value || '').trim().toLocaleLowerCase('it-IT');

// Team members (staff and admin) who can act as account managers.
export async function listTeamMembers() {
  const {data} = await createAdminClient().from('profiles').select('id,email,full_name,role,status,company_id').in('role', ['staff', 'admin']).eq('status', 'active').order('full_name').returns<ProfileRow[]>();
  return (data || []).map(person);
}

// Resolves each company's account manager: the linked profile, or else the team member whose name matches the CRM field.
async function resolveManagers(companies: CompanyRow[]) {
  const team = await listTeamMembers();
  const byId = new Map(team.map((member) => [member.id, member]));
  const byName = new Map(team.map((member) => [normalize(member.name), member]));
  let crmNames = new Map<string, string>();
  if (companies.some((company) => !company.account_manager_id)) {
    try { crmNames = new Map((await listWowproClients()).map(({id, fields}) => [id, fields.account_manager_nome || ''])); } catch { /* Fall back to linked profiles only. */ }
  }
  return new Map(companies.map((company) => {
    const linked = company.account_manager_id ? byId.get(company.account_manager_id) : undefined;
    const named = company.airtable_record_id ? byName.get(normalize(crmNames.get(company.airtable_record_id))) : undefined;
    return [company.id, linked || named || null] as const;
  }));
}

export async function getConversationCompany(companyId: string) {
  const {data} = await createAdminClient().from('companies').select('id,name,airtable_record_id,account_manager_id').eq('id', companyId).maybeSingle<CompanyRow>();
  if (!data) return null;
  const manager = (await resolveManagers([data])).get(data.id) || null;
  return {...data, manager};
}

// Clients reach only their own company; staff their own clients (or unassigned ones); admins everything.
export async function canAccessConversation(profile: CurrentProfile, companyId: string) {
  if (profile.status !== 'active') return null;
  if (profile.role === 'client') return profile.company_id === companyId ? await getConversationCompany(companyId) : null;
  if (profile.role !== 'staff' && profile.role !== 'admin') return null;
  const company = await getConversationCompany(companyId);
  if (!company) return null;
  if (profile.role === 'admin' || !company.manager || company.manager.id === profile.id) return company;
  return null;
}

export async function listMessages(companyId: string) {
  const admin = createAdminClient();
  const [{data: rows}, {data: reads}] = await Promise.all([
    admin.from('support_messages').select('id,body,file_name,file_size,file_path,created_at,author:author_id(full_name,email,role)').eq('company_id', companyId).order('created_at', {ascending: false}).limit(300),
    admin.from('support_reads').select('last_read_at,profile:profile_id(role)').eq('company_id', companyId),
  ]);
  const messages: SupportMessage[] = (rows || []).reverse().map((row) => {
    const author = (Array.isArray(row.author) ? row.author[0] : row.author) as {full_name?: string; email?: string; role?: string} | null;
    return {id: row.id, body: row.body, createdAt: row.created_at, authorName: author?.full_name || author?.email || 'Utente', fromClient: author?.role === 'client', file: row.file_path ? {name: row.file_name || 'file', size: Number(row.file_size || 0)} : null};
  });
  let teamReadAt = 0; let clientReadAt = 0;
  for (const read of reads || []) {
    const role = ((Array.isArray(read.profile) ? read.profile[0] : read.profile) as {role?: string} | null)?.role;
    const time = new Date(read.last_read_at).getTime();
    if (role === 'client') clientReadAt = Math.max(clientReadAt, time); else teamReadAt = Math.max(teamReadAt, time);
  }
  return {messages, teamReadAt: teamReadAt ? new Date(teamReadAt).toISOString() : null, clientReadAt: clientReadAt ? new Date(clientReadAt).toISOString() : null};
}

export async function markConversationRead(companyId: string, profileId: string) {
  await createAdminClient().from('support_reads').upsert({company_id: companyId, profile_id: profileId, last_read_at: new Date().toISOString()}, {onConflict: 'company_id,profile_id', ignoreDuplicates: false});
}

// Unread messages written by the other side, for the menu badge.
export async function countUnread(profile: CurrentProfile) {
  const admin = createAdminClient();
  if (profile.role === 'client') {
    if (!profile.company_id) return 0;
    const {data: read} = await admin.from('support_reads').select('last_read_at').eq('company_id', profile.company_id).eq('profile_id', profile.id).maybeSingle();
    const {data} = await admin.from('support_messages').select('id,author:author_id(role)').eq('company_id', profile.company_id).gt('created_at', read?.last_read_at || '1970-01-01');
    return (data || []).filter((row) => ((Array.isArray(row.author) ? row.author[0] : row.author) as {role?: string} | null)?.role !== 'client').length;
  }
  const conversations = await listConversations(profile);
  return conversations.reduce((total, conversation) => total + conversation.unread, 0);
}

export async function listConversations(profile: CurrentProfile): Promise<ConversationSummary[]> {
  const admin = createAdminClient();
  const [{data: companies}, {data: messages}, {data: reads}] = await Promise.all([
    admin.from('companies').select('id,name,airtable_record_id,account_manager_id').order('name').returns<CompanyRow[]>(),
    admin.from('support_messages').select('company_id,body,file_name,created_at,author:author_id(role)').order('created_at', {ascending: false}).limit(2000),
    admin.from('support_reads').select('company_id,last_read_at').eq('profile_id', profile.id),
  ]);
  const managers = await resolveManagers(companies || []);
  const readAt = new Map((reads || []).map((read) => [read.company_id, new Date(read.last_read_at).getTime()]));
  const latest = new Map<string, {body: string; at: string}>();
  const unread = new Map<string, number>();
  for (const message of messages || []) {
    if (!latest.has(message.company_id)) latest.set(message.company_id, {body: message.body || `📎 ${message.file_name || 'File'}`, at: message.created_at});
    const role = ((Array.isArray(message.author) ? message.author[0] : message.author) as {role?: string} | null)?.role;
    if (role === 'client' && new Date(message.created_at).getTime() > (readAt.get(message.company_id) || 0)) unread.set(message.company_id, (unread.get(message.company_id) || 0) + 1);
  }
  return (companies || [])
    .filter((company) => {
      const manager = managers.get(company.id);
      return profile.role === 'admin' ? true : manager ? manager.id === profile.id : latest.has(company.id);
    })
    .map((company) => ({companyId: company.id, companyName: company.name, accountManager: managers.get(company.id)?.name || 'Non assegnato', lastMessage: latest.get(company.id)?.body || '', lastAt: latest.get(company.id)?.at || null, unread: unread.get(company.id) || 0}))
    .sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || '') || a.companyName.localeCompare(b.companyName, 'it'));
}

// Emails the other side about a new message, at most once every 15 minutes per person and conversation.
export async function notifyNewMessage({company, author, body, hasFile}: {company: NonNullable<Awaited<ReturnType<typeof getConversationCompany>>>; author: CurrentProfile; body: string; hasFile: boolean}) {
  const admin = createAdminClient();
  const origin = (process.env.NEXT_PUBLIC_APP_URL || 'https://wowpro.it').replace(/\/$/, '');
  let recipients: SupportPerson[] = [];
  let link = '';
  if (author.role === 'client') {
    if (company.manager) recipients = [company.manager];
    else {
      const {data} = await admin.from('profiles').select('id,email,full_name,role,status,company_id').eq('role', 'admin').eq('status', 'active').returns<ProfileRow[]>();
      recipients = (data || []).map(person);
    }
    link = `${origin}/admin/messaggi?c=${company.id}`;
  } else {
    const {data} = await admin.from('profiles').select('id,email,full_name,role,status,company_id').eq('role', 'client').eq('status', 'active').eq('company_id', company.id).returns<ProfileRow[]>();
    recipients = (data || []).map(person);
    link = `${origin}/dashboard/supporto`;
  }
  recipients = recipients.filter((recipient) => recipient.id !== author.id);
  if (!recipients.length) return;

  const {data: reads} = await admin.from('support_reads').select('profile_id,last_emailed_at').eq('company_id', company.id).in('profile_id', recipients.map((recipient) => recipient.id));
  const lastEmailed = new Map((reads || []).map((read) => [read.profile_id, read.last_emailed_at ? new Date(read.last_emailed_at).getTime() : 0]));
  const sender = author.role === 'client' ? company.name : author.full_name || 'Il tuo account manager';
  const preview = body ? (body.length > 280 ? `${body.slice(0, 280)}…` : body) : hasFile ? 'Ti ha inviato un file.' : '';

  for (const recipient of recipients) {
    if (Date.now() - (lastEmailed.get(recipient.id) || 0) < EMAIL_INTERVAL_MS) continue;
    const subject = author.role === 'client' ? `Nuovo messaggio da ${company.name} su WOWPRO` : `Nuovo messaggio da ${sender} su WOWPRO`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#0a0d15"><p style="font-size:12px;letter-spacing:.08em;color:#11823f;font-weight:bold">WOWPRO · MESSAGGI</p><h2 style="margin:0 0 12px">Hai un nuovo messaggio da ${escapeHtml(sender)}</h2><blockquote style="margin:0 0 20px;padding:12px 16px;border-left:4px solid #1db65b;background:#f6f9fb;color:#3a4556">${escapeHtml(preview).replace(/\n/g, '<br>')}</blockquote><a href="${link}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#1db65b;color:#fff;text-decoration:none;font-weight:bold">Rispondi su WOWPRO</a><p style="margin-top:24px;font-size:12px;color:#8a95a5">Ricevi questa email perché hai un messaggio non letto su WOWPRO.</p></div>`;
    const text = `Hai un nuovo messaggio da ${sender}:\n\n${preview}\n\nRispondi su WOWPRO: ${link}`;
    try {
      if (await sendEmail({to: recipient.email, subject, html, text})) {
        await admin.from('support_reads').upsert({company_id: company.id, profile_id: recipient.id, last_emailed_at: new Date().toISOString()}, {onConflict: 'company_id,profile_id'});
      }
    } catch (error) { console.error('[Support email]', error); }
  }
}
