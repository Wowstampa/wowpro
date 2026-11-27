import {NextResponse} from 'next/server';

import {hasActiveSubscription, subscriptionRequired} from '@/lib/access';
import {getCurrentProfile} from '@/lib/auth';
import {readPriceList} from '@/lib/pricelist';
import {buildPriceListPdf} from '@/lib/pricelist-pdf';
import {createAdminClient} from '@/lib/supabase/admin.server';

// The client downloads their reserved price list as a PDF.
export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active' || profile.role !== 'client' || !profile.company_id) return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});
  if (!(await hasActiveSubscription(profile.company_id))) return subscriptionRequired();
  const [list, {data: company}] = await Promise.all([readPriceList(profile.company_id), createAdminClient().from('companies').select('name').eq('id', profile.company_id).maybeSingle()]);
  if (!list.items.length) return NextResponse.json({error: 'Il listino è ancora vuoto.'}, {status: 404});
  const name = company?.name || 'Cliente WOWPRO';
  const bytes = await buildPriceListPdf(list, name);
  const file = `Listino WOWPRO ${name}`.replace(/[^\w\s.-]/g, '').trim().replace(/\s+/g, '-');
  return new NextResponse(Buffer.from(bytes), {headers: {'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${file}.pdf"`, 'Cache-Control': 'private, no-store'}});
}
