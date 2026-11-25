import 'server-only';

import {cache} from 'react';
import {NextResponse} from 'next/server';

import {countSubscriptionPayments} from '@/lib/subscription';
import {createAdminClient} from '@/lib/supabase/admin.server';

// Client workspace access: without a paid WOWPRO subscription only the welcome page and Abbonamento are open.
// When the check itself fails the portal stays open, so a paying client is never locked out by an outage.
export const hasActiveSubscription = cache(async (companyId: string | null | undefined) => {
  if (!companyId) return false;
  try {
    const {data, error} = await createAdminClient().from('companies').select('airtable_record_id').eq('id', companyId).maybeSingle();
    if (error) return true;
    if (!data?.airtable_record_id) return false;
    return (await countSubscriptionPayments(data.airtable_record_id)) > 0;
  } catch {
    return true;
  }
});

export const OPEN_CLIENT_SECTIONS = ['abbonamento'];

export function subscriptionRequired() {
  return NextResponse.json({error: 'Questa funzione è riservata agli abbonati WOWPRO. Attiva l’abbonamento per continuare.', code: 'subscription_required'}, {status: 402});
}
