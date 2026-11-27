import {NextResponse} from 'next/server';
import {z} from 'zod';

import {getCurrentProfile} from '@/lib/auth';
import {createAdminClient} from '@/lib/supabase/admin.server';

const schema = z.object({grafica: z.boolean(), preventivi: z.boolean(), messaggi: z.boolean(), idee: z.boolean().default(true)});

// The client's email notification preferences.
export async function PUT(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active' || profile.role !== 'client') return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({error: 'Preferenze non valide.'}, {status: 400});
  const {error} = await createAdminClient().from('profiles').update({notification_prefs: parsed.data}).eq('id', profile.id);
  if (error) { console.error('[Notification prefs]', error); return NextResponse.json({error: 'Preferenze non salvate. Riprova.'}, {status: 502}); }
  return NextResponse.json({ok: true});
}
