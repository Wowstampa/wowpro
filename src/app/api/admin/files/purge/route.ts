import {NextResponse} from 'next/server';
import {z} from 'zod';

import {getCurrentProfile} from '@/lib/auth';
import {getFileStorageSummary} from '@/lib/file-archive';
import {REQUEST_FILES_BUCKET} from '@/lib/request-files';
import {createAdminClient} from '@/lib/supabase/admin.server';

const purgeSchema = z.object({fileIds: z.array(z.string().uuid()).min(1).max(5000)});

// Deletes archived files after the admin has confirmed the ZIP download. Only still-archivable files are removed.
export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active' || !['staff', 'admin'].includes(profile.role)) {
    return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});
  }
  const parsed = purgeSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({error: 'Elenco file non valido.'}, {status: 400});

  try {
    const {archivable} = await getFileStorageSummary(parsed.data.fileIds);
    if (!archivable.length) return NextResponse.json({deleted: 0, freedBytes: 0});
    const admin = createAdminClient();
    for (let i = 0; i < archivable.length; i += 100) {
      const chunk = archivable.slice(i, i + 100);
      const {error} = await admin.storage.from(REQUEST_FILES_BUCKET).remove(chunk.map((file) => file.storagePath));
      if (error) throw error;
      await admin.from('request_files').delete().in('id', chunk.map((file) => file.id));
    }
    return NextResponse.json({deleted: archivable.length, freedBytes: archivable.reduce((total, file) => total + file.size, 0)});
  } catch (error) {
    console.error('[File purge]', error);
    return NextResponse.json({error: 'Pulizia non riuscita. Nessun file è stato perso: riprova.'}, {status: 502});
  }
}
