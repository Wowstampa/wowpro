import {NextResponse} from 'next/server';

import {getCurrentProfile} from '@/lib/auth';
import {getFileStorageSummary} from '@/lib/file-archive';
import {REQUEST_FILES_BUCKET} from '@/lib/request-files';
import {createAdminClient} from '@/lib/supabase/admin.server';
import {createZipStream} from '@/lib/zip-stream';

export const maxDuration = 300;

// Streams a ZIP of the archivable files, organised by client and request. Nothing is deleted here.
export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active' || !['staff', 'admin'].includes(profile.role)) {
    return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});
  }
  const form = await request.formData();
  let fileIds: string[] = [];
  try { fileIds = JSON.parse(String(form.get('fileIds') || '[]')); } catch { /* handled below */ }
  if (!Array.isArray(fileIds) || !fileIds.length) return NextResponse.json({error: 'Nessun file da archiviare.'}, {status: 400});

  const {archivable} = await getFileStorageSummary(fileIds.map(String));
  const storage = createAdminClient().storage.from(REQUEST_FILES_BUCKET);
  const date = new Date().toISOString().slice(0, 10);
  const root = `WOWPRO-archivio-${date}`;
  const stream = createZipStream(archivable.map((file) => ({
    name: `${root}/${file.zipPath}`,
    load: async () => {
      const {data} = await storage.download(file.storagePath);
      return data ? new Uint8Array(await data.arrayBuffer()) : null;
    },
  })), (name) => console.error('[File archive] File non disponibile:', name));

  return new Response(stream, {headers: {'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${root}.zip"`, 'Cache-Control': 'no-store'}});
}
