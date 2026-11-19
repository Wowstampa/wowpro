import {NextResponse} from 'next/server';
import {z} from 'zod';

import {getCurrentProfile} from '@/lib/auth';
import {QUOTE_COLUMNS, addQuoteEvent, listQuotes, newQuotePublicId, notifyQuote, toSummary} from '@/lib/quotes';
import {createAdminClient} from '@/lib/supabase/admin.server';

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active' || !['client', 'staff', 'admin'].includes(profile.role)) return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});
  return NextResponse.json({quotes: await listQuotes(profile)}, {headers: {'Cache-Control': 'no-store'}});
}

const itemSchema = z.object({
  productId: z.string().min(1).max(80), variantId: z.string().min(1).max(80), productTitle: z.string().trim().min(1).max(200), variantTitle: z.string().trim().max(200).default(''),
  imageUrl: z.string().url().max(600).nullable().default(null), quantity: z.number().int().min(1).max(100_000), note: z.string().trim().max(500).default(''), listPrice: z.number().nonnegative().nullable().default(null),
  options: z.array(z.object({name: z.string().trim().min(1).max(120), value: z.string().trim().min(1).max(400)})).max(40).default([]),
});
const createSchema = z.object({
  kind: z.enum(['quote', 'order']), items: z.array(itemSchema).min(1, 'Aggiungi almeno un prodotto.').max(30),
  notes: z.string().trim().max(4000).default(''), neededBy: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]).default(''),
});

// A client asks for a quote (or to order) WowStampa products.
export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active' || profile.role !== 'client' || !profile.company_id) return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});
  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({error: parsed.error.issues[0]?.message || 'Richiesta non valida.'}, {status: 400});
  const {kind, items, notes, neededBy} = parsed.data;
  const admin = createAdminClient();
  const {data, error} = await admin.from('quote_requests').insert({public_id: newQuotePublicId(), company_id: profile.company_id, requested_by: profile.id, kind, items, notes, needed_by: neededBy || null}).select(QUOTE_COLUMNS).single();
  if (error || !data) {
    console.error('[Quote create]', error);
    return NextResponse.json({error: 'Richiesta non inviata. Riprova.'}, {status: 502});
  }
  await addQuoteEvent(data.id, profile.id, kind === 'order' ? 'Richiesta d’ordine inviata.' : 'Richiesta di preventivo inviata.');
  const summary = items.map((item) => `• ${item.quantity} × ${item.productTitle}${item.variantTitle ? ` (${item.variantTitle})` : ''}${item.options.length ? `\n  ${item.options.map((option) => `${option.name}: ${option.value}`).join(' · ')}` : ''}`).join('\n');
  await notifyQuote({quote: data, actor: profile, subject: kind === 'order' ? 'Nuova richiesta d’ordine' : 'Nuova richiesta di preventivo', message: `${summary}${notes ? `\n\n${notes}` : ''}`}).catch((notifyError) => console.error('[Quote notify]', notifyError));
  return NextResponse.json({quote: toSummary(data as never)}, {status: 201});
}
