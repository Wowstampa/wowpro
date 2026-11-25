import 'server-only';

import {cache} from 'react';
import {NextResponse} from 'next/server';

import {getWowproClient} from '@/lib/integrations/airtable';
import {createAdminClient} from '@/lib/supabase/admin.server';

// Client workspace access: active when the subscription was paid on Shopify OR the team set "Attivo" in Airtable
// (stato_abbonamento), e.g. for clients paying outside Shopify. Otherwise only the welcome page and Abbonamento are open.
// When the check itself fails the portal stays open, so a paying client is never locked out by an outage.
export const hasActiveSubscription = cache(async (companyId: string | null | undefined) => {
  if (!companyId) return false;
  try {
    // Company record and Shopify subscription payments are read together (one round trip instead of three).
    const admin = createAdminClient();
    const [{data, error}, {count}] = await Promise.all([
      admin.from('companies').select('airtable_record_id').eq('id', companyId).maybeSingle(),
      admin.from('credit_transactions').select('id', {count: 'exact', head: true}).eq('company_id', companyId).like('idempotency_key', 'shopify-sub-%'),
    ]);
    if ((count || 0) > 0) return true;
    if (error) return true;
    if (!data?.airtable_record_id) return false;
    const client = await getWowproClient(data.airtable_record_id);
    return isActiveStatus(client.fields.stato_abbonamento);
  } catch {
    return true;
  }
});

// "Attivo" (any case) counts; "Non attivo", "Sospeso", "Disdetto" and empty do not.
export const isActiveStatus = (value: unknown) => /^\s*attiv/i.test(String(value || ''));

export const OPEN_CLIENT_SECTIONS = ['abbonamento'];

export function subscriptionRequired() {
  return NextResponse.json({error: 'Questa funzione è riservata agli abbonati WOWPRO. Attiva l’abbonamento per continuare.', code: 'subscription_required'}, {status: 402});
}
