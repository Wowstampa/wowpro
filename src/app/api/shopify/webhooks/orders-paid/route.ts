import {NextResponse} from 'next/server';

import {getWowproClient, listWowproClients, updateWowproClient} from '@/lib/integrations/airtable';
import {creditsFromTitle, getCreditsProductId, verifyShopifyWebhook} from '@/lib/integrations/shopify';
import {createAdminClient} from '@/lib/supabase/admin.server';

type ShopifyOrder = {
  id: number;
  name: string;
  email?: string | null;
  contact_email?: string | null;
  customer?: {email?: string | null} | null;
  note_attributes?: Array<{name: string; value: string}>;
  line_items: Array<{product_id: number | null; variant_title?: string | null; title?: string | null; quantity: number}>;
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifyShopifyWebhook(rawBody, request.headers.get('x-shopify-hmac-sha256'))) {
    return NextResponse.json({error: 'Firma non valida.'}, {status: 401});
  }

  const order = JSON.parse(rawBody) as ShopifyOrder;
  const productId = getCreditsProductId();
  const credits = order.line_items
    .filter((item) => String(item.product_id) === productId)
    .reduce((total, item) => total + creditsFromTitle(item.variant_title || item.title) * item.quantity, 0);
  // Orders without WOWPRO credit packages are not our concern.
  if (!credits) return NextResponse.json({ok: true, ignored: true});

  try {
    const recordId = await findClientRecordId(order);
    if (!recordId) {
      console.error('[Credits webhook] Cliente WOWPRO non trovato per ordine', order.name);
      return NextResponse.json({ok: true, unmatched: true});
    }

    const client = await getWowproClient(recordId, {fresh: true});
    const admin = createAdminClient();
    const {data: company, error: companyError} = await admin
      .from('companies')
      .upsert({airtable_record_id: recordId, name: client.fields.ragione_sociale || client.fields.cliente_id || 'Cliente WOWPRO', shopify_customer_id: client.fields.shopify_customer_id || null}, {onConflict: 'airtable_record_id'})
      .select('id')
      .single();
    if (companyError || !company) throw companyError || new Error('Azienda non disponibile.');

    // The idempotency key makes repeated Shopify deliveries of the same order harmless.
    const {data: transaction, error: transactionError} = await admin
      .from('credit_transactions')
      .insert({company_id: company.id, bucket: 'extra', amount: credits, description: `Acquisto crediti extra · ordine Shopify ${order.name}`, idempotency_key: `shopify-order-${order.id}`})
      .select('id')
      .single();
    if (transactionError) {
      if (transactionError.code === '23505') return NextResponse.json({ok: true, duplicate: true});
      throw transactionError;
    }

    try {
      await updateWowproClient(recordId, {crediti_extra_residui: Number(client.fields.crediti_extra_residui || 0) + credits});
    } catch (error) {
      await admin.from('credit_transactions').delete().eq('id', transaction.id);
      throw error;
    }
    return NextResponse.json({ok: true, credited: credits});
  } catch (error) {
    console.error('[Credits webhook]', error);
    // A non-2xx response makes Shopify retry the delivery later.
    return NextResponse.json({error: 'Accredito non riuscito.'}, {status: 500});
  }
}

async function findClientRecordId(order: ShopifyOrder) {
  const attribute = order.note_attributes?.find((item) => item.name === 'wowpro_client')?.value?.trim();
  if (attribute && /^rec[A-Za-z0-9]+$/.test(attribute)) return attribute;
  const email = (order.email || order.contact_email || order.customer?.email || '').trim().toLowerCase();
  if (!email) return null;
  const clients = await listWowproClients();
  return clients.find(({fields}) => !fields.archiviato && fields.email_login?.trim().toLowerCase() === email)?.id || null;
}
