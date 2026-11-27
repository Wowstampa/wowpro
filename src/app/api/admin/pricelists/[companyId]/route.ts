import {NextResponse} from 'next/server';

import {getCurrentProfile} from '@/lib/auth';
import {priceListSchema, writePriceList} from '@/lib/pricelist';
import {createAdminClient} from '@/lib/supabase/admin.server';

// The team saves a client's reserved price list.
export async function PUT(request: Request, {params}: {params: Promise<{companyId: string}>}) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active' || !['admin', 'staff'].includes(profile.role)) return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});
  const {companyId} = await params;
  const {data: company} = await createAdminClient().from('companies').select('id').eq('id', companyId).maybeSingle();
  if (!company) return NextResponse.json({error: 'Cliente non trovato.'}, {status: 404});
  const parsed = priceListSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({error: parsed.error.issues[0]?.message || 'Listino non valido.'}, {status: 400});
  try {
    const list = await writePriceList(companyId, parsed.data, profile.full_name || profile.email);
    return NextResponse.json({list});
  } catch (error) {
    console.error('[Price list save]', error);
    return NextResponse.json({error: 'Listino non salvato. Riprova.'}, {status: 502});
  }
}
