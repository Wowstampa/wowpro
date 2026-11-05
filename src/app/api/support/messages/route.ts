import {NextResponse} from 'next/server';
import {z} from 'zod';

import {REQUEST_FILES_BUCKET} from '@/lib/request-files';
import {listMessages, markConversationRead, notifyNewMessage} from '@/lib/support';
import {resolveConversation} from '@/lib/support-route';
import {createAdminClient} from '@/lib/supabase/admin.server';

export async function GET(request: Request) {
  const resolved = await resolveConversation(new URL(request.url).searchParams.get('companyId'));
  if ('error' in resolved) return NextResponse.json({error: resolved.error}, {status: resolved.status});
  const {profile, company} = resolved;
  try {
    const conversation = await listMessages(company.id);
    await markConversationRead(company.id, profile.id);
    return NextResponse.json({...conversation, companyName: company.name, manager: company.manager?.name || null}, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    console.error('[Support messages]', error);
    return NextResponse.json({error: 'Messaggi non disponibili.'}, {status: 502});
  }
}

const messageSchema = z.object({
  companyId: z.string().uuid().optional(),
  body: z.string().trim().max(4000).default(''),
  file: z.object({path: z.string().min(1).max(500), name: z.string().trim().min(1).max(200), size: z.number().int().nonnegative()}).optional(),
});

export async function POST(request: Request) {
  const parsed = messageSchema.safeParse(await request.json());
  if (!parsed.success || (!parsed.data.body && !parsed.data.file)) return NextResponse.json({error: 'Scrivi un messaggio o allega un file.'}, {status: 400});
  const resolved = await resolveConversation(parsed.data.companyId);
  if ('error' in resolved) return NextResponse.json({error: resolved.error}, {status: resolved.status});
  const {profile, company} = resolved;
  const admin = createAdminClient();

  const file = parsed.data.file;
  if (file) {
    if (!file.path.startsWith(`support/${company.id}/`)) return NextResponse.json({error: 'File non valido.'}, {status: 400});
    const {data: exists} = await admin.storage.from(REQUEST_FILES_BUCKET).exists(file.path);
    if (!exists) return NextResponse.json({error: 'Il file non risulta caricato. Riprova.'}, {status: 400});
  }

  const {data, error} = await admin.from('support_messages').insert({
    company_id: company.id,
    author_id: profile.id,
    body: parsed.data.body,
    file_path: file?.path || null,
    file_name: file?.name || null,
    file_size: file?.size ?? null,
  }).select('id,created_at').single();
  if (error || !data) {
    console.error('[Support send]', error);
    return NextResponse.json({error: 'Messaggio non inviato. Riprova.'}, {status: 502});
  }
  await markConversationRead(company.id, profile.id);
  await notifyNewMessage({company, author: profile, body: parsed.data.body, hasFile: Boolean(file)}).catch((notifyError) => console.error('[Support notify]', notifyError));
  return NextResponse.json({message: {id: data.id, body: parsed.data.body, createdAt: data.created_at, authorName: profile.full_name || profile.email, fromClient: profile.role === 'client', file: file ? {name: file.name, size: file.size} : null}}, {status: 201});
}
