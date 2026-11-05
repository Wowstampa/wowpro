import {NextResponse} from 'next/server';
import {z} from 'zod';

import {ALLOWED_EXTENSIONS, MAX_FILE_BYTES, REQUEST_FILES_BUCKET, ensureRequestFilesBucket, fileExtension, safeSegment} from '@/lib/request-files';
import {resolveConversation} from '@/lib/support-route';
import {createAdminClient} from '@/lib/supabase/admin.server';

const schema = z.object({companyId: z.string().uuid().optional(), fileName: z.string().trim().min(1).max(200), size: z.number().int().positive()});

// Signed upload URL for a chat attachment; the browser uploads straight to storage.
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({error: 'File non valido.'}, {status: 400});
  const resolved = await resolveConversation(parsed.data.companyId);
  if ('error' in resolved) return NextResponse.json({error: resolved.error}, {status: resolved.status});
  if (parsed.data.size > MAX_FILE_BYTES) return NextResponse.json({error: `${parsed.data.fileName}: supera il limite di 50 MB.`}, {status: 400});
  const extension = fileExtension(parsed.data.fileName);
  if (!ALLOWED_EXTENSIONS.includes(extension)) return NextResponse.json({error: `${parsed.data.fileName}: formato non consentito.`}, {status: 400});
  try {
    await ensureRequestFilesBucket();
    const baseName = safeSegment(parsed.data.fileName.replace(/\.[^.]+$/, ''), 100).replace(/\s/g, '-');
    const path = `support/${resolved.company.id}/${crypto.randomUUID().slice(0, 8)}-${baseName}.${extension}`;
    const {data, error} = await createAdminClient().storage.from(REQUEST_FILES_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw error || new Error('URL non creato.');
    return NextResponse.json({uploadUrl: data.signedUrl, path});
  } catch (error) {
    console.error('[Support upload url]', error);
    return NextResponse.json({error: 'Caricamento non disponibile al momento.'}, {status: 502});
  }
}
