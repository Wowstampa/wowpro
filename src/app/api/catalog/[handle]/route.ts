import {NextResponse} from 'next/server';

import {getCurrentProfile} from '@/lib/auth';
import {getProductConfigurator} from '@/lib/integrations/product-config';

// Options, variants and sizes of a WowStampa product, as configured on the online store.
export async function GET(_request: Request, {params}: {params: Promise<{handle: string}>}) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active' || !['client', 'staff', 'admin'].includes(profile.role)) return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});
  const {handle} = await params;
  if (!/^[a-z0-9][a-z0-9-]{0,120}$/i.test(handle)) return NextResponse.json({error: 'Prodotto non valido.'}, {status: 400});
  try {
    return NextResponse.json({product: await getProductConfigurator(handle)}, {headers: {'Cache-Control': 'private, max-age=300'}});
  } catch (error) {
    console.error('[Catalog product]', error);
    return NextResponse.json({error: 'Dettagli del prodotto non disponibili al momento.'}, {status: 502});
  }
}
