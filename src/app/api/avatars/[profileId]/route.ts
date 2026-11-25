import {NextResponse} from 'next/server';

import {getCurrentProfile} from '@/lib/auth';
import {REQUEST_FILES_BUCKET, ensureRequestFilesBucket} from '@/lib/request-files';
import {createAdminClient} from '@/lib/supabase/admin.server';

const MAX_BYTES = 3 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const pathOf = (profileId: string) => `avatars/${profileId}`;

// Team member photo (shown to clients as their account manager). Any signed-in user can see it.
export async function GET(_request: Request, {params}: {params: Promise<{profileId: string}>}) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active') return new NextResponse(null, {status: 401});
  const {profileId} = await params;
  if (!/^[0-9a-f-]{36}$/i.test(profileId)) return new NextResponse(null, {status: 404});
  const {data} = await createAdminClient().storage.from(REQUEST_FILES_BUCKET).createSignedUrl(pathOf(profileId), 3600);
  if (!data?.signedUrl) return new NextResponse(null, {status: 404, headers: {'Cache-Control': 'private, max-age=300'}});
  return NextResponse.redirect(data.signedUrl, {headers: {'Cache-Control': 'private, max-age=300'}});
}

// Upload: admins for any team member, everyone else only for themselves.
export async function POST(request: Request, {params}: {params: Promise<{profileId: string}>}) {
  const profile = await getCurrentProfile();
  const {profileId} = await params;
  if (!profile || profile.status !== 'active' || !(profile.role === 'admin' || (profile.id === profileId && profile.role !== 'client'))) return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({error: 'Scegli un’immagine.'}, {status: 400});
  if (!TYPES.includes(file.type)) return NextResponse.json({error: 'Usa una foto JPG, PNG o WebP.'}, {status: 400});
  if (file.size > MAX_BYTES) return NextResponse.json({error: 'La foto supera i 3 MB.'}, {status: 400});
  await ensureRequestFilesBucket();
  const {error} = await createAdminClient().storage.from(REQUEST_FILES_BUCKET).upload(pathOf(profileId), Buffer.from(await file.arrayBuffer()), {contentType: file.type, upsert: true});
  if (error) return NextResponse.json({error: 'Foto non salvata. Riprova.'}, {status: 502});
  return NextResponse.json({ok: true, url: `/api/avatars/${profileId}?v=${Date.now()}`});
}
