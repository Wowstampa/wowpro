import {NextResponse} from 'next/server';
import {z} from 'zod';

import {markConversationRead, notifyNewMessage} from '@/lib/support';
import {resolveConversation} from '@/lib/support-route';
import {createAdminClient} from '@/lib/supabase/admin.server';

const schema = z.object({reason: z.string().trim().max(1500).default('')});

// The client does not cancel on their own: the request reaches the account manager in the private chat (and by email).
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({error: 'Richiesta non valida.'}, {status: 400});
  const resolved = await resolveConversation(null);
  if ('error' in resolved) return NextResponse.json({error: resolved.error}, {status: resolved.status});
  const {profile, company} = resolved;
  if (profile.role !== 'client') return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});

  const body = `Richiesta di disdetta dell'abbonamento WOWPRO.${parsed.data.reason ? `\nMotivo: ${parsed.data.reason}` : ''}`;
  const {error} = await createAdminClient().from('support_messages').insert({company_id: company.id, author_id: profile.id, body});
  if (error) {
    console.error('[Subscription cancel request]', error);
    return NextResponse.json({error: 'Richiesta non inviata. Riprova.'}, {status: 502});
  }
  await markConversationRead(company.id, profile.id);
  await notifyNewMessage({company, author: profile, body, hasFile: false}).catch((notifyError) => console.error('[Subscription cancel notify]', notifyError));
  return NextResponse.json({ok: true}, {status: 201});
}
