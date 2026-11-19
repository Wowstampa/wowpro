import {NextResponse} from 'next/server';
import {z} from 'zod';

import {getCurrentProfile} from '@/lib/auth';
import {REQUEST_FILES_BUCKET} from '@/lib/request-files';
import {getAccessibleQuote, notifyQuote} from '@/lib/quotes';
import {createAdminClient} from '@/lib/supabase/admin.server';

const schema = z.object({
  body: z.string().trim().max(4000).default(''),
  file: z.object({path: z.string().min(1).max(500), name: z.string().trim().min(1).max(200), size: z.number().int().nonnegative()}).optional(),
});

export async function POST(request: Request, {params}: {params: Promise<{quoteId: string}>}) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({error: 'Non autenticato.'}, {status: 401});
  const {quoteId} = await params;
  const quote = await getAccessibleQuote(profile, quoteId);
  if (!quote) return NextResponse.json({error: 'Preventivo non trovato.'}, {status: 404});
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success || (!parsed.data.body && !parsed.data.file)) return NextResponse.json({error: 'Scrivi un messaggio o allega un file.'}, {status: 400});
  const admin = createAdminClient();
  const file = parsed.data.file;
  if (file) {
    if (!file.path.startsWith(`quotes/${quote.id}/`)) return NextResponse.json({error: 'File non valido.'}, {status: 400});
    const {data: exists} = await admin.storage.from(REQUEST_FILES_BUCKET).exists(file.path);
    if (!exists) return NextResponse.json({error: 'Il file non risulta caricato. Riprova.'}, {status: 400});
  }
  // Emails go out only when this side has not written in the last 15 minutes.
  const {data: recent} = await admin.from('quote_messages').select('id').eq('quote_id', quote.id).eq('author_id', profile.id).eq('kind', 'comment').gt('created_at', new Date(Date.now() - 15 * 60_000).toISOString()).limit(1);
  const {error} = await admin.from('quote_messages').insert({quote_id: quote.id, author_id: profile.id, body: parsed.data.body, file_path: file?.path || null, file_name: file?.name || null, file_size: file?.size ?? null});
  if (error) {
    console.error('[Quote message]', error);
    return NextResponse.json({error: 'Messaggio non inviato. Riprova.'}, {status: 502});
  }
  await admin.from('quote_requests').update({updated_at: new Date().toISOString()}).eq('id', quote.id);
  if (!recent?.length) await notifyQuote({quote, actor: profile, subject: 'Nuovo messaggio sul preventivo', message: parsed.data.body || `Ha allegato il file ${file?.name}.`}).catch((notifyError) => console.error('[Quote notify]', notifyError));
  return NextResponse.json({ok: true}, {status: 201});
}
