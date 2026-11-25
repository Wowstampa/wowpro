import {NextResponse} from 'next/server';
import {z} from 'zod';

import {getCurrentProfile} from '@/lib/auth';
import {createAdminClient} from '@/lib/supabase/admin.server';

const schema = z.object({fullName: z.string().trim().min(2, 'Inserisci nome e cognome.').max(120), phone: z.string().trim().max(40).regex(/^[+\d\s().-]*$/, 'Numero di telefono non valido.')});

// The client's own name and phone number.
export async function PUT(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active' || profile.role !== 'client') return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({error: parsed.error.issues[0]?.message || 'Dati non validi.'}, {status: 400});
  const {error} = await createAdminClient().from('profiles').update({full_name: parsed.data.fullName, phone: parsed.data.phone || null}).eq('id', profile.id);
  if (error) { console.error('[Client profile]', error); return NextResponse.json({error: 'Profilo non salvato. Riprova.'}, {status: 502}); }
  return NextResponse.json({ok: true});
}
