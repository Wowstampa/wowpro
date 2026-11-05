import {NextResponse} from 'next/server';
import {z} from 'zod';

import {getCurrentProfile} from '@/lib/auth';
import {getWowproClient, updateWowproClient} from '@/lib/integrations/airtable';
import {createAdminClient} from '@/lib/supabase/admin.server';

const requestSchema = z.object({
  type: z.enum(['revision', 'modification', 'creation']),
  brief: z.string().trim().min(10).max(5_000),
});

const costs = {revision: 1_000, modification: 2_000, creation: 3_000} as const;

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({error: 'Non autenticato.'}, {status: 401});
  if (profile.role !== 'client' || profile.status !== 'active' || !profile.company_id) return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({error: 'La descrizione della richiesta deve contenere almeno 10 caratteri.'}, {status: 400});

  try {
    const admin = createAdminClient();
    const {data: company, error: companyError} = await admin.from('companies').select('id,airtable_record_id').eq('id', profile.company_id).maybeSingle();
    if (companyError || !company?.airtable_record_id) throw new Error('Account cliente non configurato.');

    const airtableClient = await getWowproClient(company.airtable_record_id);
    const included = Number(airtableClient.fields.crediti_inclusi_residui || 0);
    const extra = Number(airtableClient.fields.crediti_extra_residui || 0);
    const creditCost = costs[parsed.data.type];
    if (included + extra < creditCost) return NextResponse.json({error: `Crediti insufficienti: per questa richiesta servono ${creditCost.toLocaleString('it-IT')} crediti.`}, {status: 400});

    const usedIncluded = Math.min(included, creditCost);
    const usedExtra = creditCost - usedIncluded;
    const {data: designerLink} = await admin.from('companies').select('designer_id').eq('id', company.id).maybeSingle();
    const designerId = (designerLink as {designer_id?: string | null} | null)?.designer_id || null;
    const {data: graphicRequest, error: createError} = await admin.from('graphic_requests').insert({
      public_id: createPublicId(),
      company_id: company.id,
      requested_by: profile.id,
      assigned_to: designerId,
      type: parsed.data.type,
      title: createTitle(parsed.data.type, parsed.data.brief),
      brief: parsed.data.brief,
      credit_cost: creditCost,
    }).select('id,public_id,title,brief,type,status,credit_cost,created_at').single();
    if (createError || !graphicRequest) throw new Error('Richiesta non creata.');

    const transactions = [
      ...(usedIncluded ? [{company_id: company.id, bucket: 'included' as const, amount: -usedIncluded, description: `Richiesta grafica: ${graphicRequest.title}`, graphic_request_id: graphicRequest.id, created_by: profile.id}] : []),
      ...(usedExtra ? [{company_id: company.id, bucket: 'extra' as const, amount: -usedExtra, description: `Richiesta grafica: ${graphicRequest.title}`, graphic_request_id: graphicRequest.id, created_by: profile.id}] : []),
    ];
    const {error: transactionError} = await admin.from('credit_transactions').insert(transactions);
    if (transactionError) {
      await admin.from('graphic_requests').delete().eq('id', graphicRequest.id);
      throw new Error('Registro crediti non disponibile.');
    }

    try {
      await updateWowproClient(company.airtable_record_id, {
        crediti_inclusi_residui: included - usedIncluded,
        crediti_extra_residui: extra - usedExtra,
      });
    } catch {
      await admin.from('credit_transactions').delete().eq('graphic_request_id', graphicRequest.id);
      await admin.from('graphic_requests').delete().eq('id', graphicRequest.id);
      throw new Error('Impossibile aggiornare il saldo crediti.');
    }

    await admin.from('request_events').insert({request_id: graphicRequest.id, actor_id: profile.id, event_type: 'created_by_client', public_message: 'Richiesta inviata dal cliente.'});
    return NextResponse.json({request: {id: graphicRequest.id, publicId: graphicRequest.public_id, title: graphicRequest.title, brief: graphicRequest.brief, type: graphicRequest.type, status: graphicRequest.status, creditCost: graphicRequest.credit_cost, createdAt: graphicRequest.created_at}}, {status: 201});
  } catch (error) {
    console.error('[Client request creation]', error);
    return NextResponse.json({error: error instanceof Error ? error.message : 'Impossibile creare la richiesta.'}, {status: 502});
  }
}

function createPublicId() {
  const suffix = crypto.randomUUID().slice(0, 6).toUpperCase();
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `RG-${date}-${suffix}`;
}

function createTitle(type: keyof typeof costs, brief: string) {
  const label = {revision: 'Revisione', modification: 'Modifica', creation: 'Creazione'}[type];
  return `${label}: ${brief.replace(/\s+/g, ' ').slice(0, 110)}`;
}
