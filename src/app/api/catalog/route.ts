import {NextResponse} from 'next/server';

import {getCurrentProfile} from '@/lib/auth';
import {searchCatalog} from '@/lib/integrations/shopify';

// WowStampa catalog search for quote requests.
export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active' || !['client', 'staff', 'admin'].includes(profile.role)) return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});
  try {
    return NextResponse.json({products: await searchCatalog(new URL(request.url).searchParams.get('q') || '')}, {headers: {'Cache-Control': 'private, max-age=60'}});
  } catch (error) {
    console.error('[Catalog]', error);
    return NextResponse.json({error: 'Catalogo non disponibile al momento.'}, {status: 502});
  }
}
