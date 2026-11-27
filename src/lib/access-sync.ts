import 'server-only';

import {createAdminClient} from '@/lib/supabase/admin.server';

// Airtable decides who enters the portal and with which role:
// - a contact in "Utenti" with status "Attivo" is team (role from the linked "Ruoli" record);
// - otherwise a contact in "Clienti" (not archived) is a client of that company;
// - anyone else loses access. The last active admin is never removed.

type Role = 'admin' | 'staff' | 'graphic_operator' | 'client';
type Status = 'active' | 'suspended' | 'revoked';
type Desired = {role: Role; status: Status; name: string; clientRecordId?: string; clientName?: string; source: 'Utenti' | 'Clienti'};
type ProfileRow = {id: string; email: string; role: string; status: string; company_id: string | null; full_name: string | null};
type AirtableRow = {id: string; fields: Record<string, unknown>};

export type AccessSyncReport = {changed: Array<{email: string; from: string; to: string}>; pending: Array<{email: string; name: string; role: Role; source: string}>; skipped: string[]; invited: string[]};

const LEVEL_TO_ROLE: Record<string, Role> = {Admin: 'admin', 'Account Manager': 'staff', Supporto: 'staff', Grafico: 'graphic_operator'};
const ROLE_TO_LEVEL: Record<Exclude<Role, 'client'>, string> = {admin: 'Admin', staff: 'Account Manager', graphic_operator: 'Grafico'};
const USER_STATUS: Record<string, Status> = {Attivo: 'active', Sospeso: 'suspended', Disabilitato: 'revoked'};
const STATUS_TO_AIRTABLE: Record<Status, string> = {active: 'Attivo', suspended: 'Sospeso', revoked: 'Disabilitato'};
export const ROLE_LABELS: Record<Role, string> = {admin: 'Admin', staff: 'Team commerciale', graphic_operator: 'Grafico', client: 'Cliente'};

const norm = (value: unknown) => String(value || '').trim().toLowerCase();
const selectName = (value: unknown) => (value && typeof value === 'object' && 'name' in value ? String((value as {name: unknown}).name) : String(value || '')).trim();

function config() {
  const token = process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!token || !baseId) throw new Error('Configurazione Airtable incompleta.');
  return {token, baseId, clients: process.env.AIRTABLE_CLIENTS_TABLE || 'Clienti', users: process.env.AIRTABLE_USERS_TABLE || 'Utenti', roles: process.env.AIRTABLE_ROLES_TABLE || 'Ruoli'};
}

async function readTable(table: string): Promise<AirtableRow[]> {
  const {token, baseId} = config();
  const rows: AirtableRow[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);
    const response = await fetch(url, {headers: {Authorization: `Bearer ${token}`}, cache: 'no-store', signal: AbortSignal.timeout(10_000)});
    if (!response.ok) throw new Error(`Airtable (${table}) ha risposto con stato ${response.status}.`);
    const payload = await response.json() as {records: AirtableRow[]; offset?: string};
    rows.push(...payload.records);
    offset = payload.offset;
  } while (offset);
  return rows;
}

async function writeRow(table: string, recordId: string | null, fields: Record<string, unknown>) {
  const {token, baseId} = config();
  const response = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}${recordId ? `/${recordId}` : ''}`, {
    method: recordId ? 'PATCH' : 'POST',
    headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({fields, typecast: true}),
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Airtable (${table}) ha risposto con stato ${response.status}: ${(await response.text().catch(() => '')).slice(0, 300)}`);
}

// Who should have which access, according to Airtable right now.
async function readDesiredAccess() {
  const {clients, users, roles} = config();
  const [clientRows, userRows, roleRows] = await Promise.all([readTable(clients), readTable(users), readTable(roles)]);
  const levelOf = new Map(roleRows.map((row) => [row.id, selectName(row.fields.livello_accesso)]));
  const desired = new Map<string, Desired>();

  for (const row of clientRows) {
    const email = norm(row.fields.email_login);
    if (!email || row.fields.archiviato === true) continue;
    const name = String(row.fields.ragione_sociale || '');
    desired.set(email, {role: 'client', status: 'active', name, clientRecordId: row.id, clientName: name, source: 'Clienti'});
  }
  for (const row of userRows) {
    const email = norm(row.fields.email);
    if (!email) continue;
    const roleLinks = (row.fields.ruolo as string[] | undefined) || [];
    const level = roleLinks.map((id) => levelOf.get(id) || '').find(Boolean) || '';
    const role = LEVEL_TO_ROLE[level];
    if (!role) continue; // "Cliente" level or no role: the Clienti table decides.
    const status = USER_STATUS[selectName(row.fields.stato_utente)] || 'suspended';
    // Utenti wins over Clienti, unless the user record is not active and the client one is.
    if (status !== 'active' && desired.get(email)?.status === 'active') continue;
    desired.set(email, {role, status, name: String(row.fields.nome_cognome || ''), source: 'Utenti'});
  }
  return desired;
}

async function companyFor(recordId: string, name: string) {
  const admin = createAdminClient();
  const {data: found} = await admin.from('companies').select('id').eq('airtable_record_id', recordId).maybeSingle();
  if (found) return found.id as string;
  const {data, error} = await admin.from('companies').upsert({airtable_record_id: recordId, name: name || 'Cliente WOWPRO'}, {onConflict: 'airtable_record_id'}).select('id').single();
  if (error || !data) throw error || new Error('Azienda non trovata.');
  return data.id as string;
}

// Aligns portal accounts with Airtable. With `email`, only that person is checked (used at login).
export async function syncAccessFromAirtable(options: {email?: string; userId?: string} = {}): Promise<AccessSyncReport> {
  const admin = createAdminClient();
  const desired = await readDesiredAccess();
  const only = options.email ? norm(options.email) : null;
  const report: AccessSyncReport = {changed: [], pending: [], skipped: [], invited: []};

  const query = admin.from('profiles').select('id,email,role,status,company_id,full_name');
  const {data, error} = only ? await query.eq('email', only) : await query;
  if (error) throw error;
  const profiles = (data || []) as ProfileRow[];

  // Safety: never leave the portal without an active admin.
  const {data: admins} = await admin.from('profiles').select('id').eq('role', 'admin').eq('status', 'active');
  let activeAdmins = (admins || []).length;
  const airtableHasAdmin = [...desired.values()].some((entry) => entry.role === 'admin' && entry.status === 'active');

  // Colleagues of a client (other logins of the same company) keep access while that client is active in Airtable.
  const activeClientRecords = new Set([...desired.values()].map((entry) => entry.clientRecordId).filter(Boolean) as string[]);
  const {data: companyRows} = await admin.from('companies').select('id,airtable_record_id');
  const activeCompanies = new Set((companyRows || []).filter((row) => row.airtable_record_id && activeClientRecords.has(row.airtable_record_id)).map((row) => row.id as string));

  for (const profile of profiles) {
    const email = norm(profile.email);
    let want = desired.get(email);
    if (!want && profile.role === 'client' && profile.company_id && activeCompanies.has(profile.company_id)) want = {role: 'client', status: profile.status as Status, name: '', source: 'Clienti'};
    const nextRole = (want?.role || profile.role) as Role;
    const nextStatus: Status = want ? want.status : 'revoked';
    const nextCompany = want?.role === 'client' ? (want.clientRecordId ? await companyFor(want.clientRecordId, want.clientName || '') : profile.company_id) : want ? null : profile.company_id;
    if (profile.role === nextRole && profile.status === nextStatus && (profile.company_id || null) === (nextCompany || null)) continue;

    const losesAdmin = profile.role === 'admin' && profile.status === 'active' && (nextRole !== 'admin' || nextStatus !== 'active');
    if (losesAdmin && (activeAdmins <= 1 || !airtableHasAdmin)) { report.skipped.push(`${email}: è l’ultimo admin attivo`); continue; }

    const {error: updateError} = await admin.from('profiles').update({role: nextRole, status: nextStatus, company_id: nextCompany, ...(want?.name && !profile.full_name ? {full_name: want.name} : {})}).eq('id', profile.id);
    if (updateError) { report.skipped.push(`${email}: ${updateError.message}`); continue; }
    if (losesAdmin) activeAdmins -= 1;
    if (profile.role !== 'admin' && nextRole === 'admin' && nextStatus === 'active') activeAdmins += 1;
    // Someone who is no longer team cannot stay assigned to clients.
    if (['admin', 'staff', 'graphic_operator'].includes(profile.role) && (nextRole === 'client' || nextStatus !== 'active')) {
      await admin.from('companies').update({account_manager_id: null}).eq('account_manager_id', profile.id);
      await admin.from('companies').update({designer_id: null}).eq('designer_id', profile.id);
    }
    report.changed.push({email, from: `${ROLE_LABELS[profile.role as Role] || profile.role} · ${profile.status}`, to: `${ROLE_LABELS[nextRole]} · ${nextStatus}`});
  }

  // Contacts in Airtable without a portal profile: those who already have a login get one (no email sent),
  // the others wait for an invite from the Team page.
  const known = new Set(profiles.map((profile) => norm(profile.email)));
  const accounts = only ? new Map(options.userId ? [[only, options.userId]] : []) : await authAccounts();
  for (const [email, want] of desired) {
    if ((only && email !== only) || known.has(email) || want.status !== 'active') continue;
    const userId = accounts.get(email);
    if (userId) {
      const companyId = want.role === 'client' && want.clientRecordId ? await companyFor(want.clientRecordId, want.clientName || '') : null;
      const {error: insertError} = await admin.from('profiles').upsert({id: userId, email, full_name: want.name || null, role: want.role, status: 'active', company_id: companyId}, {onConflict: 'id'});
      if (insertError) report.skipped.push(`${email}: ${insertError.message}`);
      else { report.changed.push({email, from: 'nessun profilo', to: `${ROLE_LABELS[want.role]} · active`}); if (want.role === 'admin') activeAdmins += 1; }
    } else if (!only) report.pending.push({email, name: want.name, role: want.role, source: want.source});
  }
  if (!only) {
    // Bootstrap: with no admin left in the portal, Airtable admins are invited straight away.
    if (activeAdmins === 0) {
      for (const entry of report.pending.filter((item) => item.role === 'admin')) {
        try { await inviteFromAirtable(entry.email); report.invited.push(entry.email); } catch (inviteError) { console.error('[Access bootstrap]', inviteError); }
      }
      report.pending = report.pending.filter((item) => !report.invited.includes(item.email));
    }
  }
  return report;
}

// Login accounts (Supabase Auth) by email.
async function authAccounts() {
  const admin = createAdminClient();
  const map = new Map<string, string>();
  for (let page = 1; page <= 20; page += 1) {
    const {data, error} = await admin.auth.admin.listUsers({page, perPage: 1000});
    if (error) throw error;
    for (const user of data.users) if (user.email) map.set(norm(user.email), user.id);
    if (data.users.length < 1000) break;
  }
  return map;
}

// Sends the portal invite to a contact listed in Airtable, with the role Airtable gives them.
export async function inviteFromAirtable(email: string) {
  const want = (await readDesiredAccess()).get(norm(email));
  if (!want || want.status !== 'active') throw new Error('Questa email non è un contatto attivo in Airtable.');
  const admin = createAdminClient();
  const origin = (process.env.NEXT_PUBLIC_APP_URL || 'https://wowpro.it').replace(/\/$/, '');
  const {data: invitation, error} = await admin.auth.admin.inviteUserByEmail(norm(email), {redirectTo: `${origin}/auth/callback?next=/auth/set-password`});
  if (error || !invitation.user) throw error || new Error('Invito non creato.');
  const companyId = want.role === 'client' && want.clientRecordId ? await companyFor(want.clientRecordId, want.clientName || '') : null;
  const {error: profileError} = await admin.from('profiles').upsert({id: invitation.user.id, email: norm(email), full_name: want.name || null, role: want.role, status: 'active', company_id: companyId}, {onConflict: 'id'});
  if (profileError) throw profileError;
}

// Changes made from the portal's Team page are written to Airtable "Utenti", so the next sync keeps them.
export async function writeTeamMemberToAirtable(member: {email: string; fullName: string; role: Exclude<Role, 'client'>; status: Status}) {
  const {users, roles} = config();
  const [userRows, roleRows] = await Promise.all([readTable(users), readTable(roles)]);
  const roleRecord = roleRows.find((row) => selectName(row.fields.livello_accesso) === ROLE_TO_LEVEL[member.role]);
  const existing = userRows.find((row) => norm(row.fields.email) === norm(member.email));
  const fields: Record<string, unknown> = {email: norm(member.email), nome_cognome: member.fullName, stato_utente: STATUS_TO_AIRTABLE[member.status]};
  if (roleRecord) fields.ruolo = [roleRecord.id];
  if (!existing) fields.utente_id = member.fullName;
  await writeRow(users, existing?.id || null, fields);
}
