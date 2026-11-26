import 'server-only';

import {gzipSync} from 'node:zlib';

import {listWowproClients} from '@/lib/integrations/airtable';
import {REQUEST_FILES_BUCKET, ensureRequestFilesBucket} from '@/lib/request-files';
import {createAdminClient} from '@/lib/supabase/admin.server';

// Daily safety copy of the portal data (all tables plus the Airtable client records) as a compressed JSON file in
// the private storage bucket. The last KEEP_DAYS copies are kept. It protects against mistakes and bugs; for a
// full disaster copy the Supabase Pro plan adds managed daily backups.
const TABLES = ['companies', 'profiles', 'plans', 'subscriptions', 'credit_transactions', 'graphic_requests', 'request_events', 'request_files', 'request_messages', 'feedback', 'feedback_votes', 'support_messages', 'support_reads', 'quote_requests', 'quote_messages'];
const FOLDER = 'backups';
const KEEP_DAYS = 14;

async function dumpTable(table: string) {
  const admin = createAdminClient();
  const rows: unknown[] = [];
  for (let from = 0; ; from += 1000) {
    const {data, error} = await admin.from(table).select('*').range(from, from + 999);
    if (error) return {error: error.message, rows};
    rows.push(...(data || []));
    if (!data || data.length < 1000) return {rows};
  }
}

export async function runBackup(now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const admin = createAdminClient();
  await ensureRequestFilesBucket();
  const tables: Record<string, unknown> = {};
  const counts: Record<string, number> = {};
  for (const table of TABLES) {
    const result = await dumpTable(table);
    tables[table] = result.error ? {error: result.error} : result.rows;
    counts[table] = result.rows.length;
  }
  let airtable: unknown = null;
  try { airtable = await listWowproClients(); } catch (error) { airtable = {error: error instanceof Error ? error.message : 'Airtable non disponibile'}; }
  const body = gzipSync(Buffer.from(JSON.stringify({createdAt: now.toISOString(), tables, airtable})));
  const {error} = await admin.storage.from(REQUEST_FILES_BUCKET).upload(`${FOLDER}/wowpro-${day}.json.gz`, body, {upsert: true, contentType: 'application/gzip'});
  if (error) throw error;

  // Retention: delete copies older than KEEP_DAYS.
  const {data: existing} = await admin.storage.from(REQUEST_FILES_BUCKET).list(FOLDER, {limit: 200, sortBy: {column: 'name', order: 'desc'}});
  const old = (existing || []).map((file) => file.name).filter((name) => /^wowpro-\d{4}-\d{2}-\d{2}\.json\.gz$/.test(name)).slice(KEEP_DAYS);
  if (old.length) await admin.storage.from(REQUEST_FILES_BUCKET).remove(old.map((name) => `${FOLDER}/${name}`));
  return {file: `${FOLDER}/wowpro-${day}.json.gz`, bytes: body.length, counts, removed: old.length};
}
