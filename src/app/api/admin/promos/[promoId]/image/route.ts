import {NextResponse} from 'next/server';

import {getCurrentProfile} from '@/lib/auth';
import {readStore, writeStore} from '@/lib/promos';
import {REQUEST_FILES_BUCKET, ensureRequestFilesBucket} from '@/lib/request-files';
import {createAdminClient} from '@/lib/supabase/admin.server';

const TYPES: Record<string, string> = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'};
const MAX_BYTES = 5 * 1024 * 1024;

// The promo picture shown to clients.
export async function POST(request: Request, {params}: {params: Promise<{promoId: string}>}) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active' || !['admin', 'staff'].includes(profile.role)) return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});
  const {promoId} = await params;
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({error: 'Scegli un’immagine.'}, {status: 400});
  const extension = TYPES[file.type];
  if (!extension) return NextResponse.json({error: 'Usa un’immagine JPG, PNG o WebP.'}, {status: 400});
  if (file.size > MAX_BYTES) return NextResponse.json({error: 'L’immagine supera i 5 MB.'}, {status: 400});
  const store = await readStore();
  const promo = store.promos.find((item) => item.id === promoId);
  if (!promo) return NextResponse.json({error: 'Promo non trovata.'}, {status: 404});
  await ensureRequestFilesBucket();
  const admin = createAdminClient();
  const path = `promos/${promoId}.${extension}`;
  if (promo.image && promo.image.path !== path) await admin.storage.from(REQUEST_FILES_BUCKET).remove([promo.image.path]);
  const {error} = await admin.storage.from(REQUEST_FILES_BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), {contentType: file.type, upsert: true});
  if (error) return NextResponse.json({error: 'Immagine non salvata. Riprova.'}, {status: 502});
  promo.image = {path, version: Date.now()};
  await writeStore(store);
  return NextResponse.json({promo});
}
