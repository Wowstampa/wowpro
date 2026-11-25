import 'server-only';

import {createAdminClient} from '@/lib/supabase/admin.server';

export type ClientFileGroup = {requestId: string; publicId: string; title: string; status: string; at: string; files: Array<{id: string; name: string; size: number; createdAt: string}>};

const one = <T,>(value: T | T[] | null | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;

// Every file the team delivered to the client (drafts and finals), grouped by design request, newest first.
export async function listClientFiles(companyId: string): Promise<ClientFileGroup[]> {
  const admin = createAdminClient();
  const {data: requests} = await admin.from('graphic_requests').select('id,public_id,title,status,created_at,completed_at').eq('company_id', companyId).order('created_at', {ascending: false}).limit(300);
  if (!requests?.length) return [];
  const {data: files} = await admin.from('request_files').select('id,request_id,file_name,size_bytes,created_at,uploader:uploaded_by(role)').in('request_id', requests.map((request) => request.id)).eq('customer_visible', true).order('created_at', {ascending: false});
  const byRequest = new Map<string, ClientFileGroup['files']>();
  for (const file of files || []) {
    if ((one(file.uploader) as {role?: string} | null)?.role === 'client') continue;
    byRequest.set(file.request_id, [...(byRequest.get(file.request_id) || []), {id: file.id, name: file.file_name, size: Number(file.size_bytes || 0), createdAt: file.created_at}]);
  }
  return requests.filter((request) => byRequest.has(request.id)).map((request) => {
    const list = byRequest.get(request.id)!;
    return {requestId: request.id, publicId: request.public_id, title: request.title, status: request.status, at: list[0].createdAt, files: list};
  }).sort((a, b) => b.at.localeCompare(a.at));
}
