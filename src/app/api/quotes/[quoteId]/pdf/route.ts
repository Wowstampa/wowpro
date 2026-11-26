import {NextResponse} from 'next/server';

import {getCurrentProfile} from '@/lib/auth';
import {billingFromClient} from '@/lib/billing';
import {getWowproClient} from '@/lib/integrations/airtable';
import {buildQuotePdf} from '@/lib/quote-pdf';
import {getAccessibleQuote, toSummary} from '@/lib/quotes';
import {createAdminClient} from '@/lib/supabase/admin.server';

// The quote as a PDF, for the client (or the team) to download and forward.
export async function GET(_request: Request, {params}: {params: Promise<{quoteId: string}>}) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({error: 'Non autenticato.'}, {status: 401});
  const {quoteId} = await params;
  const row = await getAccessibleQuote(profile, quoteId);
  if (!row) return NextResponse.json({error: 'Preventivo non trovato.'}, {status: 404});
  const quote = toSummary(row as never);
  if (!quote.offer) return NextResponse.json({error: 'Il preventivo non è ancora pronto.'}, {status: 409});

  const {data: company} = await createAdminClient().from('companies').select('name,airtable_record_id').eq('id', (row as {company_id: string}).company_id).maybeSingle();
  let client = {name: company?.name || quote.companyName, vatNumber: '', address: '', email: ''};
  if (company?.airtable_record_id) {
    try {
      const record = await getWowproClient(company.airtable_record_id);
      const billing = billingFromClient(record.fields);
      client = {name: billing.company || client.name, vatNumber: billing.vatNumber, address: [billing.address, [billing.zip, billing.city, billing.province ? `(${billing.province})` : ''].filter(Boolean).join(' ')].filter(Boolean).join(', '), email: record.fields.email_login || ''};
    } catch { /* Company name only. */ }
  }
  const bytes = await buildQuotePdf({
    publicId: quote.publicId, createdAt: quote.createdAt, quotedAt: quote.quotedAt, validUntil: quote.validUntil, orderName: quote.orderName,
    client, offer: quote.offer, total: quote.total, currency: quote.currency, payUrl: quote.invoiceUrl, express: Boolean(quote.express),
  });
  return new NextResponse(Buffer.from(bytes), {headers: {'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="Preventivo-${quote.publicId}.pdf"`, 'Cache-Control': 'private, no-store'}});
}
