import {NextResponse} from 'next/server';
import {z} from 'zod';

import {getCurrentProfile} from '@/lib/auth';
import {getWowproClient} from '@/lib/integrations/airtable';
import {createQuoteDraftOrder, deleteDraftOrder} from '@/lib/integrations/shopify';
import {QUOTE_COLUMNS, addQuoteEvent, getAccessibleQuote, isQuoteTeam, notifyQuote, toSummary} from '@/lib/quotes';
import {createAdminClient} from '@/lib/supabase/admin.server';

const schema = z.object({
  lines: z.array(z.object({variantId: z.union([z.string().regex(/^gid:\/\/shopify\/ProductVariant\/\d+$/), z.literal('')]).default(''), title: z.string().trim().min(1).max(300), quantity: z.number().int().min(1).max(100_000), unitPrice: z.number().min(0).max(1_000_000), properties: z.array(z.object({name: z.string().trim().min(1).max(120), value: z.string().trim().min(1).max(3000)})).max(40).optional()})).min(1).max(30),
  shipping: z.number().min(0).max(100_000).default(0),
  note: z.string().trim().max(2000).default(''),
});

// The account manager prices the request: a Shopify draft order is created and the client can pay it from the portal.
export async function POST(request: Request, {params}: {params: Promise<{quoteId: string}>}) {
  const profile = await getCurrentProfile();
  if (!profile || !isQuoteTeam(profile)) return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});
  const {quoteId} = await params;
  const quote = await getAccessibleQuote(profile, quoteId);
  if (!quote) return NextResponse.json({error: 'Preventivo non trovato.'}, {status: 404});
  if (quote.status === 'paid' || quote.status === 'cancelled') return NextResponse.json({error: 'Questa richiesta è già chiusa.'}, {status: 409});
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({error: parsed.error.issues[0]?.message || 'Preventivo non valido.'}, {status: 400});

  const admin = createAdminClient();
  try {
    const {data: company} = await admin.from('companies').select('airtable_record_id,shopify_customer_id').eq('id', quote.company_id).maybeSingle();
    const {data: requester} = await admin.from('quote_requests').select('requester:requested_by(email)').eq('id', quote.id).maybeSingle();
    let email = ((Array.isArray(requester?.requester) ? requester?.requester[0] : requester?.requester) as {email?: string} | null)?.email || '';
    let customerId = company?.shopify_customer_id || null;
    if (company?.airtable_record_id) {
      try { const client = await getWowproClient(company.airtable_record_id); email = client.fields.email_login || email; customerId = client.fields.shopify_customer_id || customerId; } catch { /* CRM optional. */ }
    }
    const {data: previous} = await admin.from('quote_requests').select('draft_order_id').eq('id', quote.id).maybeSingle();
    const draft = await createQuoteDraftOrder({quoteId: quote.id, publicId: quote.public_id, email, customerId, lines: parsed.data.lines, shipping: parsed.data.shipping, note: parsed.data.note});
    if (previous?.draft_order_id) await deleteDraftOrder(previous.draft_order_id);
    const offer = {lines: parsed.data.lines, shipping: parsed.data.shipping, note: parsed.data.note, validUntil: null};
    const {data: updated, error} = await admin.from('quote_requests').update({status: 'quoted', offer, draft_order_id: draft.id, invoice_url: draft.invoiceUrl, quote_total: draft.total, currency: draft.currency, quoted_at: new Date().toISOString(), updated_at: new Date().toISOString()}).eq('id', quote.id).select(QUOTE_COLUMNS).single();
    if (error || !updated) throw error || new Error('Preventivo non salvato.');
    const total = new Intl.NumberFormat('it-IT', {style: 'currency', currency: draft.currency}).format(draft.total);
    await addQuoteEvent(quote.id, profile.id, `${previous?.draft_order_id ? 'Preventivo aggiornato' : 'Preventivo inviato'}: ${total} IVA inclusa.`);
    await notifyQuote({quote, actor: profile, subject: 'Il tuo preventivo è pronto', message: `Totale ${total} IVA inclusa.${parsed.data.note ? `\n\n${parsed.data.note}` : ''}\n\nPuoi accettarlo e pagarlo con carta dal portale.`}).catch((notifyError) => console.error('[Quote notify]', notifyError));
    return NextResponse.json({quote: toSummary(updated as never)});
  } catch (error) {
    console.error('[Quote offer]', error);
    const message = error instanceof Error && /access|scope|permission/i.test(error.message) ? 'L’app Shopify non ha ancora il permesso di creare ordini bozza.' : `Impossibile creare il preventivo su Shopify${error instanceof Error && error.message ? ` (${error.message.slice(0, 200)})` : ''}. Riprova.`;
    return NextResponse.json({error: message}, {status: 502});
  }
}
