import {NextResponse} from 'next/server';

import {getCurrentProfile} from '@/lib/auth';
import {REQUEST_FILES_BUCKET, getAccessibleRequest} from '@/lib/request-files';
import {createAdminClient} from '@/lib/supabase/admin.server';

// Redirects to a short-lived signed download link after checking access.
export async function GET(_request: Request, {params}: {params: Promise<{fileId: string}>}) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({error: 'Non autenticato.'}, {status: 401});
  const {fileId} = await params;
  const admin = createAdminClient();
  const {data: file} = await admin.from('request_files').select('request_id,storage_path,file_name,customer_visible').eq('id', fileId).maybeSingle();
  if (!file) return NextResponse.json({error: 'File non trovato.'}, {status: 404});
  const graphicRequest = await getAccessibleRequest(profile, file.request_id);
  if (!graphicRequest || (profile.role === 'client' && !file.customer_visible)) return NextResponse.json({error: 'File non trovato.'}, {status: 404});

  const {data, error} = await admin.storage.from(REQUEST_FILES_BUCKET).createSignedUrl(file.storage_path, 120, {download: file.file_name});
  if (error || !data) return NextResponse.json({error: 'Il file non è più disponibile: potrebbe essere stato archiviato.'}, {status: 410});
  return NextResponse.redirect(data.signedUrl);
}
