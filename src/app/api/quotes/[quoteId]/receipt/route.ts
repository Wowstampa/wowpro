import {NextResponse} from 'next/server';
import {z} from 'zod';

import {getCurrentProfile} from '@/lib/auth';
import {REQUEST_FILES_BUCKET} from '@/lib/request-files';
import {QUOTE_COLUMNS, addQuoteEvent, getAccessibleQuote, notifyQuote, toSummary, type QuoteOffer} from '@/lib/quotes';
import {createAdminClient} from '@/lib/supabase/admin.server';

const schema = z.object({path: z.string().min(1).max(500), name: z.string().trim().min(1).max(200), size: z.number().int().nonnegative()});

// The client uploads the bank transfer receipt (contabile): the account manager is emailed and can check it in the portal.
export async function POST(request: Request, {params}: {params: Promise<{quoteId: string}>}) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== 'client') return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});
  const {quoteId} = await params;
  const quote = await getAccessibleQuote(profile, quoteId);
  if (!quote) return NextResponse.json({error: 'Preventivo non trovato.'}, {status: 404});
  if (quote.status !== 'quoted' || !quote.order_name) return NextResponse.json({error: 'La contabile si carica solo per gli ordini in attesa di bonifico.'}, {status: 409});
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success || !parsed.data.path.startsWith(`quotes/${quote.id}/`)) return NextResponse.json({error: 'File non valido.'}, {status: 400});
  const admin = createAdminClient();
  const {data: exists} = await admin.storage.from(REQUEST_FILES_BUCKET).exists(parsed.data.path);
  if (!exists) return NextResponse.json({error: 'Il file non risulta caricato. Riprova.'}, {status: 400});

  const {data: message, error} = await admin.from('quote_messages').insert({quote_id: quote.id, author_id: profile.id, kind: 'comment', body: 'Contabile del bonifico', file_path: parsed.data.path, file_name: parsed.data.name, file_size: parsed.data.size}).select('id,created_at').single();
  if (error || !message) return NextResponse.json({error: 'Contabile non salvata. Riprova.'}, {status: 502});
  const offer = {...(quote.offer || {}), receipt: {messageId: message.id, name: parsed.data.name, uploadedAt: message.created_at}} as QuoteOffer;
  const {data: updated} = await admin.from('quote_requests').update({offer, updated_at: new Date().toISOString()}).eq('id', quote.id).select(QUOTE_COLUMNS).single();
  await addQuoteEvent(quote.id, profile.id, `Contabile del bonifico caricata per l’ordine ${quote.order_name}.`);
  await notifyQuote({quote, actor: profile, subject: 'Contabile del bonifico caricata', message: `Il cliente ha caricato la contabile del bonifico per l’ordine ${quote.order_name} (${parsed.data.name}). Verifica l’accredito e segna l’ordine come pagato dal portale.`}).catch((notifyError) => console.error('[Quote notify]', notifyError));
  return NextResponse.json({quote: toSummary((updated || quote) as never)});
}
