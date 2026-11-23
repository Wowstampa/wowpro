import {NextResponse} from 'next/server';
import {z} from 'zod';

import {getCurrentProfile} from '@/lib/auth';
import {publishQuoteDraft} from '@/lib/quote-draft';
import {QUOTE_COLUMNS, addQuoteEvent, getAccessibleQuote, isQuoteTeam, notifyQuote, toSummary} from '@/lib/quotes';
import {createAdminClient} from '@/lib/supabase/admin.server';

const schema = z.object({
  lines: z.array(z.object({variantId: z.union([z.string().regex(/^gid:\/\/shopify\/ProductVariant\/\d+$/), z.literal('')]).default(''), title: z.string().trim().min(1).max(300), quantity: z.number().int().min(1).max(100_000), unitPrice: z.number().min(0).max(1_000_000), properties: z.array(z.object({name: z.string().trim().min(1).max(120), value: z.string().trim().min(1).max(3000)})).max(40).optional()})).min(1).max(30),
  shipping: z.number().min(0).max(100_000).default(0),
  note: z.string().trim().max(2000).default(''),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
});

// The account manager prices the request: a Shopify draft order is created and the client can pay it from the portal.
export async function POST(request: Request, {params}: {params: Promise<{quoteId: string}>}) {
  const profile = await getCurrentProfile();
  if (!profile || !isQuoteTeam(profile)) return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});
  const {quoteId} = await params;
  const quote = await getAccessibleQuote(profile, quoteId);
  if (!quote) return NextResponse.json({error: 'Preventivo non trovato.'}, {status: 404});
  if (quote.status === 'paid' || quote.status === 'cancelled') return NextResponse.json({error: 'Questa richiesta è già chiusa.'}, {status: 409});
  if (quote.order_name) return NextResponse.json({error: `Il cliente ha già confermato l’ordine ${quote.order_name}: modificalo direttamente su Shopify.`}, {status: 409});
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({error: parsed.error.issues[0]?.message || 'Preventivo non valido.'}, {status: 400});

  const admin = createAdminClient();
  try {
    const draft = await publishQuoteDraft({quote, lines: parsed.data.lines, shipping: parsed.data.shipping, note: parsed.data.note});
    const offer = {lines: parsed.data.lines, shipping: parsed.data.shipping, note: parsed.data.note, validUntil: parsed.data.validUntil};
    const {data: updated, error} = await admin.from('quote_requests').update({status: 'quoted', offer, draft_order_id: draft.id, invoice_url: draft.invoiceUrl, quote_total: draft.total, currency: draft.currency, quoted_at: new Date().toISOString(), updated_at: new Date().toISOString()}).eq('id', quote.id).select(QUOTE_COLUMNS).single();
    if (error || !updated) throw error || new Error('Preventivo non salvato.');
    const total = new Intl.NumberFormat('it-IT', {style: 'currency', currency: draft.currency}).format(draft.total);
    await addQuoteEvent(quote.id, profile.id, `${draft.replaced ? 'Preventivo aggiornato' : 'Preventivo inviato'}: ${total} IVA inclusa.`);
    await notifyQuote({quote, actor: profile, subject: 'Il tuo preventivo è pronto', message: `Totale ${total} IVA inclusa${parsed.data.validUntil ? `, valido fino al ${new Intl.DateTimeFormat('it-IT', {day: 'numeric', month: 'long', year: 'numeric'}).format(new Date(`${parsed.data.validUntil}T12:00:00`))}` : ''}.${parsed.data.note ? `\n\n${parsed.data.note}` : ''}\n\nPuoi accettarlo e pagarlo con carta dal portale.`}).catch((notifyError) => console.error('[Quote notify]', notifyError));
    return NextResponse.json({quote: toSummary(updated as never)});
  } catch (error) {
    console.error('[Quote offer]', error);
    const message = error instanceof Error && /access|scope|permission/i.test(error.message) ? 'L’app Shopify non ha ancora il permesso di creare ordini bozza.' : `Impossibile creare il preventivo su Shopify${error instanceof Error && error.message ? ` (${error.message.slice(0, 200)})` : ''}. Riprova.`;
    return NextResponse.json({error: message}, {status: 502});
  }
}
