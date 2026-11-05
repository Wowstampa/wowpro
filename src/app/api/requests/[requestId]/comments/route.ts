import {NextResponse} from 'next/server';
import {z} from 'zod';

import {getCurrentProfile} from '@/lib/auth';
import {getAccessibleRequest} from '@/lib/request-files';
import {isTeam, notifyRequestUpdate} from '@/lib/request-thread';
import {createAdminClient} from '@/lib/supabase/admin.server';

const schema = z.object({body: z.string().trim().min(1).max(2000), internal: z.boolean().optional()});

export async function POST(request: Request, {params}: {params: Promise<{requestId: string}>}) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({error: 'Non autenticato.'}, {status: 401});
  const {requestId} = await params;
  if (!(await getAccessibleRequest(profile, requestId))) return NextResponse.json({error: 'Richiesta non trovata.'}, {status: 404});
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({error: 'Scrivi un commento (massimo 2000 caratteri).'}, {status: 400});

  // Only the team can write internal notes, which clients never see.
  const internal = isTeam(profile) && Boolean(parsed.data.internal);
  const admin = createAdminClient();
  const {data, error} = await admin.from('request_messages').insert({request_id: requestId, author_id: profile.id, body: parsed.data.body, customer_visible: !internal}).select('id,created_at').single();
  if (error || !data) {
    console.error('[Request comment]', error);
    return NextResponse.json({error: 'Commento non inviato. Riprova.'}, {status: 502});
  }
  if (!internal) {
    await admin.from('graphic_requests').update({awaiting_client_response: profile.role !== 'client', updated_at: new Date().toISOString()}).eq('id', requestId);
    await notifyRequestUpdate({requestId, actor: profile, subject: profile.role === 'client' ? 'Nuovo commento dal cliente' : 'Nuovo messaggio sulla tua richiesta', message: parsed.data.body}).catch((notifyError) => console.error('[Request notify]', notifyError));
  }
  return NextResponse.json({comment: {id: data.id, createdAt: data.created_at}}, {status: 201});
}
