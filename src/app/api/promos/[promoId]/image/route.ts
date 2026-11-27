import {NextResponse} from 'next/server';

import {getCurrentProfile} from '@/lib/auth';
import {readStore} from '@/lib/promos';
import {REQUEST_FILES_BUCKET} from '@/lib/request-files';
import {createAdminClient} from '@/lib/supabase/admin.server';

// Promo picture, for any signed-in user (it is marketing material).
export async function GET(_request: Request, {params}: {params: Promise<{promoId: string}>}) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active') return new NextResponse(null, {status: 401});
  const {promoId} = await params;
  const promo = (await readStore()).promos.find((item) => item.id === promoId);
  if (!promo?.image) return new NextResponse(null, {status: 404});
  const {data} = await createAdminClient().storage.from(REQUEST_FILES_BUCKET).createSignedUrl(promo.image.path, 3600);
  if (!data?.signedUrl) return new NextResponse(null, {status: 404});
  return NextResponse.redirect(data.signedUrl, {headers: {'Cache-Control': 'private, max-age=600'}});
}
