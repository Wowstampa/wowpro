import {NextResponse} from 'next/server';

import {getCurrentProfile} from '@/lib/auth';
import {getInvoice} from '@/lib/invoices';
import {REQUEST_FILES_BUCKET} from '@/lib/request-files';
import {canAccessConversation} from '@/lib/support';
import {createAdminClient} from '@/lib/supabase/admin.server';

// Downloads an invoice: the client for its own company, the team for the clients it follows.
export async function GET(request: Request, {params}: {params: Promise<{invoiceId: string}>}) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({error: 'Non autenticato.'}, {status: 401});
  const companyId = profile.role === 'client' ? profile.company_id : new URL(request.url).searchParams.get('companyId');
  if (!companyId || !(await canAccessConversation(profile, companyId))) return NextResponse.json({error: 'Fattura non trovata.'}, {status: 404});
  const {invoiceId} = await params;
  const invoice = await getInvoice(companyId, invoiceId);
  if (!invoice) return NextResponse.json({error: 'Fattura non trovata.'}, {status: 404});
  const {data} = await createAdminClient().storage.from(REQUEST_FILES_BUCKET).createSignedUrl(invoice.path, 120, {download: invoice.name});
  if (!data?.signedUrl) return NextResponse.json({error: 'Fattura non disponibile.'}, {status: 404});
  return NextResponse.redirect(data.signedUrl);
}
