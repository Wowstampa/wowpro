import {NextResponse} from 'next/server';

import {readBrandKit, toBrandKitView, writeBrandKit} from '@/lib/brand-kit';
import {resolveBrandKit} from '@/lib/brand-kit-route';
import {REQUEST_FILES_BUCKET} from '@/lib/request-files';
import {createAdminClient} from '@/lib/supabase/admin.server';

// Opens (preview) or downloads a brand kit file through a short-lived signed URL.
export async function GET(request: Request, {params}: {params: Promise<{fileId: string}>}) {
  const url = new URL(request.url);
  const resolved = await resolveBrandKit(url.searchParams.get('companyId'), 'read');
  if ('response' in resolved) return resolved.response;
  const {fileId} = await params;
  const file = (await readBrandKit(resolved.companyId)).files.find((item) => item.id === fileId);
  if (!file) return NextResponse.json({error: 'File non trovato.'}, {status: 404});
  const {data} = await createAdminClient().storage.from(REQUEST_FILES_BUCKET).createSignedUrl(file.path, 300, url.searchParams.has('download') ? {download: file.name} : undefined);
  if (!data?.signedUrl) return NextResponse.json({error: 'File non disponibile.'}, {status: 404});
  return NextResponse.redirect(data.signedUrl, {headers: {'Cache-Control': 'private, max-age=240'}});
}

export async function DELETE(request: Request, {params}: {params: Promise<{fileId: string}>}) {
  const resolved = await resolveBrandKit(new URL(request.url).searchParams.get('companyId'), 'edit');
  if ('response' in resolved) return resolved.response;
  const {fileId} = await params;
  const kit = await readBrandKit(resolved.companyId);
  const file = kit.files.find((item) => item.id === fileId);
  if (!file) return NextResponse.json({error: 'File non trovato.'}, {status: 404});
  try {
    await writeBrandKit(resolved.companyId, {...kit, files: kit.files.filter((item) => item.id !== fileId)});
    await createAdminClient().storage.from(REQUEST_FILES_BUCKET).remove([file.path]);
  } catch (error) {
    console.error('[Brand kit delete]', error);
    return NextResponse.json({error: 'File non eliminato. Riprova.'}, {status: 502});
  }
  return NextResponse.json({kit: toBrandKitView(await readBrandKit(resolved.companyId))});
}
