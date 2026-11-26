import 'server-only';

import {getWowproClient, updateWowproClient} from '@/lib/integrations/airtable';
import {createAdminClient} from '@/lib/supabase/admin.server';

export const SUBSCRIPTION_MONTHLY_CREDITS = Number(process.env.WOWPRO_SUBSCRIPTION_CREDITS || 12_000);
const PAYMENT_KEY = 'shopify-sub-';

async function companyFor(recordId: string, name: string, shopifyCustomerId: string | null) {
  const {data, error} = await createAdminClient().from('companies')
    .upsert({airtable_record_id: recordId, name, ...(shopifyCustomerId ? {shopify_customer_id: shopifyCustomerId} : {})}, {onConflict: 'airtable_record_id'})
    .select('id').single();
  if (error || !data) throw error || new Error('Azienda non disponibile.');
  return data.id as string;
}

// Number of subscription payments recorded for the client (first purchase and renewals).
export async function countSubscriptionPayments(recordId: string) {
  const admin = createAdminClient();
  const {data: company} = await admin.from('companies').select('id').eq('airtable_record_id', recordId).maybeSingle();
  if (!company) return 0;
  const {count} = await admin.from('credit_transactions').select('id', {count: 'exact', head: true}).eq('company_id', company.id).like('idempotency_key', `${PAYMENT_KEY}%`);
  return count || 0;
}

// A paid subscription order activates the plan, moves the renewal date and restores the monthly included credits.
export async function recordSubscriptionPayment({recordId, orderId, orderName, annual, shopifyCustomerId, paidAt}: {recordId: string; orderId: number; orderName: string; annual: boolean; shopifyCustomerId: string | null; paidAt: string}) {
  const client = await getWowproClient(recordId, {fresh: true});
  const companyId = await companyFor(recordId, client.fields.ragione_sociale || client.fields.cliente_id || 'Cliente WOWPRO', client.fields.shopify_customer_id ? null : shopifyCustomerId);
  const previous = Number(client.fields.crediti_inclusi_residui || 0);
  const admin = createAdminClient();
  // The idempotency key makes repeated Shopify deliveries of the same order harmless.
  const {data: transaction, error} = await admin.from('credit_transactions')
    .insert({company_id: companyId, bucket: 'included', amount: SUBSCRIPTION_MONTHLY_CREDITS - previous, description: `Abbonamento WOWPRO ${annual ? 'annuale' : 'mensile'} · ordine Shopify ${orderName}: crediti inclusi ripristinati a ${SUBSCRIPTION_MONTHLY_CREDITS.toLocaleString('it-IT', {useGrouping: 'always'} as Intl.NumberFormatOptions)}`, idempotency_key: `${PAYMENT_KEY}${orderId}`})
    .select('id').single();
  if (error) {
    if (error.code === '23505') return {duplicate: true};
    throw error;
  }
  const renewal = new Date(paidAt);
  if (annual) renewal.setFullYear(renewal.getFullYear() + 1); else renewal.setMonth(renewal.getMonth() + 1);
  try {
    await updateWowproClient(recordId, {
      stato_abbonamento: 'Attivo',
      crediti_inclusi_mese: SUBSCRIPTION_MONTHLY_CREDITS,
      crediti_inclusi_residui: SUBSCRIPTION_MONTHLY_CREDITS,
      data_rinnovo_piano: renewal.toISOString().slice(0, 10),
      ...(!client.fields.shopify_customer_id && shopifyCustomerId ? {shopify_customer_id: shopifyCustomerId} : {}),
    });
  } catch (updateError) {
    await admin.from('credit_transactions').delete().eq('id', transaction.id);
    throw updateError;
  }
  return {activated: true};
}
