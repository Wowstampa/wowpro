import {NextResponse} from 'next/server';
import {z} from 'zod';

import {getCurrentProfile} from '@/lib/auth';
import {createAdminClient} from '@/lib/supabase/admin.server';

const updateOperatorSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  role: z.enum(['admin', 'staff', 'graphic_operator']),
  status: z.enum(['active', 'suspended', 'revoked']),
  phone: z.string().trim().max(40).regex(/^[+\d\s().-]*$/).optional(),
});

export async function PATCH(request: Request, {params}: {params: Promise<{profileId: string}>}) {
  const currentProfile = await getCurrentProfile();
  if (!currentProfile) return NextResponse.json({error: 'Non autenticato.'}, {status: 401});
  if (currentProfile.role !== 'admin' || currentProfile.status !== 'active') return NextResponse.json({error: 'Accesso riservato all’amministrazione.'}, {status: 403});
  const parsed = updateOperatorSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({error: 'Dati operatore non validi.'}, {status: 400});
  const {profileId} = await params;
  if (profileId === currentProfile.id && (parsed.data.role !== 'admin' || parsed.data.status !== 'active')) {
    return NextResponse.json({error: 'Non puoi rimuovere o limitare il tuo accesso amministrativo.'}, {status: 400});
  }
  try {
    const {data, error} = await createAdminClient().from('profiles').update({full_name: parsed.data.fullName, role: parsed.data.role, status: parsed.data.status}).eq('id', profileId).select('id,email,full_name,role,status,created_at').single();
    if (error || !data) throw error || new Error('Operatore non aggiornato.');
    let phone: string | null = null;
    if (parsed.data.phone !== undefined) {
      const {error: phoneError} = await createAdminClient().from('profiles').update({phone: parsed.data.phone || null}).eq('id', profileId);
      if (phoneError) console.error('[Team phone]', phoneError); else phone = parsed.data.phone || null;
    }
    return NextResponse.json({operator: {...data, phone}});
  } catch (error) {
    console.error('[Team update]', error);
    return NextResponse.json({error: 'Impossibile aggiornare l’operatore.'}, {status: 502});
  }
}
