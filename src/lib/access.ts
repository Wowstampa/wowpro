import 'server-only';

import {cache} from 'react';
import {NextResponse} from 'next/server';

import {getWowproClient} from '@/lib/integrations/airtable';
import {countSubscriptionPayments} from '@/lib/subscription';
import {createAdminClient} from '@/lib/supabase/admin.server';

// Client workspace access: active when the subscription was paid on Shopify OR the team set "Attivo" in Airtable
// (stato_abbonamento), e.g. for clients paying outside Shopify. Otherwise only the welcome page and Abbonamento are open.
// When the check itself fails the portal stays open, so a paying client is never locked out by an outage.
export const hasActiveSubscription = cache(async (companyId: string | null | undefined) => {
  if (!companyId) return false;
  try {
    const {data, error} = await createAdminClient().from('companies').select('airtable_record_id').eq('id', companyId).maybeSingle();
    if (error) return true;
    if (!data?.airtable_record_id) return false;
    if ((await countSubscriptionPayments(data.airtable_record_id)) > 0) return true;
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
