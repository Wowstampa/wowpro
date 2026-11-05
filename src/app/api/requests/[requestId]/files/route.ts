import {NextResponse} from 'next/server';
import {z} from 'zod';

import {getCurrentProfile} from '@/lib/auth';
import {ALLOWED_EXTENSIONS, MAX_FILE_BYTES, REQUEST_FILES_BUCKET, ensureRequestFilesBucket, fileExtension, getAccessibleRequest, safeSegment} from '@/lib/request-files';
import {createAdminClient} from '@/lib/supabase/admin.server';

const uploadSchema = z.object({fileName: z.string().trim().min(1).max(200), size: z.number().int().positive()});

// Step 1: returns a signed URL the browser uploads to directly, bypassing this server.
export async function POST(request: Request, {params}: {params: Promise<{requestId: string}>}) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({error: 'Non autenticato.'}, {status: 401});
  const {requestId} = await params;
  const graphicRequest = await getAccessibleRequest(profile, requestId);
  if (!graphicRequest) return NextResponse.json({error: 'Richiesta non trovata.'}, {status: 404});

  const parsed = uploadSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({error: 'File non valido.'}, {status: 400});
  if (parsed.data.size > MAX_FILE_BYTES) return NextResponse.json({error: `${parsed.data.fileName}: supera il limite di 50 MB.`}, {status: 400});
  const extension = fileExtension(parsed.data.fileName);
  if (!ALLOWED_EXTENSIONS.includes(extension)) return NextResponse.json({error: `${parsed.data.fileName}: formato non consentito.`}, {status: 400});

  try {
    await ensureRequestFilesBucket();
    const baseName = safeSegment(parsed.data.fileName.replace(/\.[^.]+$/, ''), 100).replace(/\s/g, '-');
    const path = `${graphicRequest.company_id}/${graphicRequest.id}/${crypto.randomUUID().slice(0, 8)}-${baseName}.${extension}`;
    const {data, error} = await createAdminClient().storage.from(REQUEST_FILES_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw error || new Error('URL di caricamento non creato.');
    return NextResponse.json({uploadUrl: data.signedUrl, path});
  } catch (error) {
    console.error('[File upload url]', error);
    return NextResponse.json({error: 'Caricamento non disponibile al momento.'}, {status: 502});
  }
}
