import 'server-only';

import {listWowproClients} from '@/lib/integrations/airtable';
import {ARCHIVE_AFTER_DAYS, safeSegment} from '@/lib/request-files';
import {createAdminClient} from '@/lib/supabase/admin.server';

export type ArchivableFile = {id: string; storagePath: string; zipPath: string; size: number};

type FileRow = {
  id: string; storage_path: string; file_name: string; size_bytes: number | null;
  graphic_requests: {public_id: string; title: string; status: string; completed_at: string | null; updated_at: string; companies: {name: string; airtable_record_id: string | null} | null} | null;
};

// Storage usage plus the files of requests closed more than ARCHIVE_AFTER_DAYS days ago.
export async function getFileStorageSummary(fileIds?: string[]) {
  let query = createAdminClient()
    .from('request_files')
    .select('id,storage_path,file_name,size_bytes,graphic_requests(public_id,title,status,completed_at,updated_at,companies(name,airtable_record_id))')
    .order('created_at', {ascending: true});
  if (fileIds) query = query.in('id', fileIds);
  const {data, error} = await query.returns<FileRow[]>();
  if (error) throw error;

  const rows = data || [];
  const usedBytes = rows.reduce((total, row) => total + Number(row.size_bytes || 0), 0);
  const threshold = Date.now() - ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000;
  const closed = rows.filter((row) => {
    const request = row.graphic_requests;
    if (!request || !['completed', 'rejected'].includes(request.status)) return false;
    return new Date(request.completed_at || request.updated_at).getTime() < threshold;
  });

  const clientIds = new Map<string, string>();
  if (closed.length) {
    try { for (const {id, fields} of await listWowproClients()) if (fields.cliente_id) clientIds.set(id, fields.cliente_id); } catch { /* Folder names fall back to the company name only. */ }
  }

  const used = new Set<string>();
  const archivable: ArchivableFile[] = closed.map((row) => {
    const request = row.graphic_requests!;
    const company = request.companies;
    const clientId = company?.airtable_record_id ? clientIds.get(company.airtable_record_id) : undefined;
    const companyFolder = safeSegment([clientId, company?.name || 'Cliente'].filter(Boolean).join(' - '));
    const requestFolder = safeSegment(`${request.public_id} - ${request.title}`);
    let zipPath = `${companyFolder}/${requestFolder}/${safeSegment(row.file_name, 150)}`;
    for (let copy = 2; used.has(zipPath); copy++) zipPath = zipPath.replace(/(\.[^./]+)?$/, ` (${copy})$1`);
    used.add(zipPath);
    return {id: row.id, storagePath: row.storage_path, zipPath, size: Number(row.size_bytes || 0)};
  });

  return {usedBytes, fileCount: rows.length, archivable};
}
