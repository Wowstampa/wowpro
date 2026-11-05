import {NextResponse} from 'next/server';
import {z} from 'zod';

import {getCurrentProfile} from '@/lib/auth';
import {REQUEST_FILES_BUCKET, getAccessibleRequest} from '@/lib/request-files';
import {createAdminClient} from '@/lib/supabase/admin.server';

const confirmSchema = z.object({path: z.string().min(1).max(500), fileName: z.string().trim().min(1).max(200), size: z.number().int().nonnegative(), mimeType: z.string().max(120).optional()});

// Step 2: registers the file once the browser upload has finished.
export async function POST(request: Request, {params}: {params: Promise<{requestId: string}>}) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({error: 'Non autenticato.'}, {status: 401});
  const {requestId} = await params;
  const graphicRequest = await getAccessibleRequest(profile, requestId);
  if (!graphicRequest) return NextResponse.json({error: 'Richiesta non trovata.'}, {status: 404});

  const parsed = confirmSchema.safeParse(await request.json());
  if (!parsed.success || !parsed.data.path.startsWith(`${graphicRequest.company_id}/${graphicRequest.id}/`)) {
    return NextResponse.json({error: 'File non valido.'}, {status: 400});
  }

  const admin = createAdminClient();
  const {data: exists} = await admin.storage.from(REQUEST_FILES_BUCKET).exists(parsed.data.path);
  if (!exists) return NextResponse.json({error: 'Il file non risulta caricato. Riprova.'}, {status: 400});

  const {data, error} = await admin.from('request_files').insert({
    request_id: graphicRequest.id,
    uploaded_by: profile.id,
    storage_path: parsed.data.path,
    file_name: parsed.data.fileName,
    mime_type: parsed.data.mimeType || null,
    size_bytes: parsed.data.size,
  }).select('id,file_name,size_bytes,created_at').single();
  if (error || !data) {
    console.error('[File confirm]', error);
    return NextResponse.json({error: 'Impossibile registrare il file.'}, {status: 502});
  }
  return NextResponse.json({file: {id: data.id, name: data.file_name, size: Number(data.size_bytes || 0), createdAt: data.created_at}}, {status: 201});
}
