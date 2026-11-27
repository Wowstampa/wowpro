import {NextResponse} from 'next/server';
import {z} from 'zod';

import {getCurrentProfile} from '@/lib/auth';
import {createAdminClient} from '@/lib/supabase/admin.server';
import {writeTeamMemberToAirtable} from '@/lib/access-sync';

const createOperatorSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(320),
  role: z.enum(['admin', 'staff', 'graphic_operator']),
});

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({error: 'Non autenticato.'}, {status: 401});
  if (profile.role !== 'admin' || profile.status !== 'active') return NextResponse.json({error: 'Accesso riservato all’amministrazione.'}, {status: 403});
  const parsed = createOperatorSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({error: 'Dati operatore non validi.'}, {status: 400});

  try {
    const admin = createAdminClient();
    const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const {data: invitation, error: invitationError} = await admin.auth.admin.inviteUserByEmail(parsed.data.email.toLowerCase(), {redirectTo: `${origin}/auth/callback?next=/auth/set-password`});
    if (invitationError || !invitation.user) {
      if (invitationError?.message.toLowerCase().includes('already')) return NextResponse.json({error: 'Esiste già un account con questa email. Usa Modifica per aggiornarne il ruolo.'}, {status: 409});
      throw invitationError || new Error('Invito non creato.');
    }
    const {data: createdProfile, error: profileError} = await admin
      .from('profiles')
      .upsert({id: invitation.user.id, email: parsed.data.email.toLowerCase(), full_name: parsed.data.fullName, role: parsed.data.role, status: 'active'}, {onConflict: 'id'})
      .select('id,email,full_name,role,status,created_at')
      .single();
    if (profileError || !createdProfile) throw profileError || new Error('Profilo non creato.');
    let warning: string | undefined;
    try { await writeTeamMemberToAirtable({email: createdProfile.email, fullName: parsed.data.fullName, role: parsed.data.role, status: 'active'}); }
    catch (airtableError) { console.error('[Team Airtable]', airtableError); warning = 'Invito inviato, ma la persona non è stata aggiunta in Airtable (Utenti): aggiungila a mano, altrimenti la sincronizzazione le toglie l’accesso.'; }
    return NextResponse.json({operator: createdProfile, warning}, {status: 201});
  } catch (error) {
    console.error('[Team invite]', error);
    return NextResponse.json({error: 'Impossibile invitare l’operatore.'}, {status: 502});
  }
}
