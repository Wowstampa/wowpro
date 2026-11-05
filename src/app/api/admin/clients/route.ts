import {NextResponse} from 'next/server';
import {z} from 'zod';

import {getCurrentProfile} from '@/lib/auth';
import {createWowproClient, nextWowproClientId} from '@/lib/integrations/airtable';
import {createAdminClient} from '@/lib/supabase/admin.server';

const createSchema = z.object({
  ragione_sociale: z.string().trim().min(1).max(200),
  email_login: z.string().trim().email().max(254),
  piano: z.string().trim().min(1).max(80),
  stato_abbonamento: z.string().trim().min(1).max(80),
  account_manager_nome: z.string().trim().max(120).optional(),
  shopify_customer_id: z.string().trim().max(120).optional(),
  crediti_inclusi_mese: z.coerce.number().int().min(0).max(100_000).optional(),
  invia_invito: z.boolean().optional(),
});

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({error: 'Non autenticato.'}, {status: 401});
  if (!['staff', 'admin'].includes(profile.role) || profile.status !== 'active') {
    return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});
  }

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({error: 'Dati cliente non validi.'}, {status: 400});

  const {invia_invito: sendInvite = true, crediti_inclusi_mese: monthlyCredits = 0, ...data} = parsed.data;
  const email = data.email_login.toLowerCase();

  let record;
  try {
    record = await createWowproClient({
      ...data,
      email_login: email,
      cliente_id: await nextWowproClientId(),
      crediti_inclusi_mese: monthlyCredits,
      crediti_inclusi_residui: monthlyCredits,
      crediti_extra_residui: 0,
      archiviato: false,
    });
  } catch (error) {
    console.error('[Client create]', error);
    return NextResponse.json({error: 'Impossibile creare il cliente.'}, {status: 502});
  }

  // The client exists in Airtable from here on: portal access problems become warnings, not failures.
  let warning: string | undefined;
  try {
    const admin = createAdminClient();
    const {data: company, error: companyError} = await admin
      .from('companies')
      .upsert({
        airtable_record_id: record.id,
        name: data.ragione_sociale,
        shopify_customer_id: data.shopify_customer_id || null,
      }, {onConflict: 'airtable_record_id'})
      .select('id')
      .single();
    if (companyError || !company) throw companyError || new Error('Azienda non creata.');

    if (sendInvite) {
      const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
      const {data: invitation, error: invitationError} = await admin.auth.admin.inviteUserByEmail(email, {redirectTo: `${origin}/auth/callback?next=/dashboard/home`});
      if (invitationError || !invitation.user) {
        if (invitationError?.message.toLowerCase().includes('already')) {
          warning = 'Cliente creato. Esiste già un account con questa email, quindi non è stato inviato un nuovo invito.';
        } else {
          throw invitationError || new Error('Invito non creato.');
        }
      } else {
        const {error: profileError} = await admin
          .from('profiles')
          .upsert({id: invitation.user.id, email, full_name: data.ragione_sociale, role: 'client', company_id: company.id, status: 'active'}, {onConflict: 'id'});
        if (profileError) throw profileError;
      }
    }
  } catch (error) {
    console.error('[Client portal access]', error);
    warning = 'Cliente creato, ma non è stato possibile attivare l’accesso al portale. Riprova più tardi o contatta l’amministrazione.';
  }

  return NextResponse.json({recordId: record.id, fields: record.fields, warning}, {status: 201});
}
