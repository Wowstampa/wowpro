import {NextResponse} from 'next/server';
import {z} from 'zod';

import {BRAND_FILE_EXTENSIONS, MAX_BRAND_FILES, brandFilePath, readBrandKit, toBrandKitView, writeBrandKit} from '@/lib/brand-kit';
import {resolveBrandKit} from '@/lib/brand-kit-route';
import {MAX_FILE_BYTES, REQUEST_FILES_BUCKET, ensureRequestFilesBucket, fileExtension} from '@/lib/request-files';
import {createAdminClient} from '@/lib/supabase/admin.server';

const schema = z.discriminatedUnion('step', [
  z.object({step: z.literal('start'), companyId: z.string().uuid().optional(), fileName: z.string().trim().min(1).max(200), size: z.number().int().positive()}),
  z.object({step: z.literal('finish'), companyId: z.string().uuid().optional(), fileId: z.string().regex(/^[0-9a-f]{12}$/), fileName: z.string().trim().min(1).max(200), size: z.number().int().positive(), kind: z.enum(['logo', 'file'])}),
]);

// Two steps: a signed upload URL (the browser uploads straight to storage), then the file is added to the kit.
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({error: 'File non valido.'}, {status: 400});
  const resolved = await resolveBrandKit(parsed.data.companyId, 'edit');
  if ('response' in resolved) return resolved.response;
  const {companyId} = resolved;
  const extension = fileExtension(parsed.data.fileName);
  if (!BRAND_FILE_EXTENSIONS.includes(extension)) return NextResponse.json({error: `${parsed.data.fileName}: formato non consentito.`}, {status: 400});
  if (parsed.data.size > MAX_FILE_BYTES) return NextResponse.json({error: `${parsed.data.fileName}: supera il limite di 50 MB.`}, {status: 400});
  const kit = await readBrandKit(companyId);

  if (parsed.data.step === 'start') {
    if (kit.files.length >= MAX_BRAND_FILES) return NextResponse.json({error: `Puoi caricare al massimo ${MAX_BRAND_FILES} file: elimina quelli che non servono più.`}, {status: 400});
    try {
      await ensureRequestFilesBucket();
      const fileId = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      const {data, error} = await createAdminClient().storage.from(REQUEST_FILES_BUCKET).createSignedUploadUrl(brandFilePath(companyId, fileId, extension));
      if (error || !data) throw error || new Error('URL non creato.');
      return NextResponse.json({uploadUrl: data.signedUrl, fileId});
    } catch (error) {
      console.error('[Brand kit upload url]', error);
      return NextResponse.json({error: 'Caricamento non disponibile al momento.'}, {status: 502});
    }
  }

  const path = brandFilePath(companyId, parsed.data.fileId, extension);
  const {data: exists} = await createAdminClient().storage.from(REQUEST_FILES_BUCKET).createSignedUrl(path, 30);
  if (!exists?.signedUrl) return NextResponse.json({error: 'Caricamento non completato. Riprova.'}, {status: 400});
  const file = {id: parsed.data.fileId, name: parsed.data.fileName, size: parsed.data.size, kind: parsed.data.kind, path, uploadedAt: new Date().toISOString()};
  try {
    await writeBrandKit(companyId, {...kit, files: [...kit.files.filter((item) => item.id !== file.id), file]});
  } catch (error) {
    console.error('[Brand kit file]', error);
    return NextResponse.json({error: 'File non salvato. Riprova.'}, {status: 502});
  }
  return NextResponse.json({kit: toBrandKitView(await readBrandKit(companyId))}, {status: 201});
}
