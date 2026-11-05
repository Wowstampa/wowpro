import {NextResponse} from 'next/server';
import {z} from 'zod';

import {getCurrentProfile} from '@/lib/auth';
import {updateWowproClient} from '@/lib/integrations/airtable';
import {createAdminClient} from '@/lib/supabase/admin.server';

const updateSchema = z.object({
  ragione_sociale: z.string().trim().min(1).max(200),
  email_login: z.string().trim().email().max(254),
  piano: z.string().trim().min(1).max(80),
  stato_abbonamento: z.string().trim().min(1).max(80),
  account_manager_nome: z.string().trim().max(120).optional(),
  account_manager_id: z.union([z.string().uuid(), z.literal('')]).optional(),
  designer_id: z.union([z.string().uuid(), z.literal('')]).optional(),
  shopify_customer_id: z.string().trim().max(120).optional(),
});

export async function PATCH(request: Request, {params}: {params: Promise<{recordId: string}>}) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({error: 'Non autenticato.'}, {status: 401});
  if (!['staff', 'admin'].includes(profile.role) || profile.status !== 'active') {
    return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});
  }

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({error: 'Dati cliente non validi.'}, {status: 400});

  try {
    const {recordId} = await params;
    const {account_manager_id: managerId, designer_id: designerId, ...fields} = parsed.data;
    const record = await updateWowproClient(recordId, fields);
    if (managerId !== undefined) {
      // The account manager link lives in Supabase: it decides who receives the client's chat messages.
      const {error} = await createAdminClient().from('companies').upsert({airtable_record_id: recordId, name: fields.ragione_sociale, shopify_customer_id: fields.shopify_customer_id || null, account_manager_id: managerId || null}, {onConflict: 'airtable_record_id'});
      if (error) console.error('[Client manager link]', error);
    }
    if (designerId !== undefined) {
      // Separate update: the designer column may not exist until its migration has run.
      const {error} = await createAdminClient().from('companies').update({designer_id: designerId || null}).eq('airtable_record_id', recordId);
      if (error) console.error('[Client designer link]', error);
      else if (designerId) {
        // Open requests still without a designer go to the newly chosen one.
        const admin = createAdminClient();
        const {data: company} = await admin.from('companies').select('id').eq('airtable_record_id', recordId).maybeSingle();
        if (company) await admin.from('graphic_requests').update({assigned_to: designerId}).eq('company_id', company.id).is('assigned_to', null).in('status', ['new', 'in_progress', 'review']);
      }
    }
    return NextResponse.json({fields: record.fields});
  } catch (error) {
    console.error('[Client update]', error);
    return NextResponse.json({error: 'Impossibile aggiornare il cliente.'}, {status: 502});
  }
}
