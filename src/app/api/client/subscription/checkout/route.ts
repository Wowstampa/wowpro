import {NextResponse} from 'next/server';
import {z} from 'zod';

import {billingSchema, billingToClient} from '@/lib/billing';
import {getAppOrigin, getClientAccount} from '@/lib/client-account';
import {getWowproClient, updateWowproClient} from '@/lib/integrations/airtable';
import {buildSubscriptionCheckoutUrl, ensureOrdersPaidWebhook} from '@/lib/integrations/shopify';
import {createAdminClient} from '@/lib/supabase/admin.server';

const TERMS_VERSION = '2026-11-26';

const schema = z.object({plan: z.enum(['monthly', 'annual']), billing: billingSchema, acceptedTerms: z.literal(true, {message: 'Per continuare accetta i Termini del servizio e l’Informativa privacy.'})});

// Saves the billing details on the client record and returns the Shopify checkout for the chosen plan.
export async function POST(request: Request) {
  const account = await getClientAccount();
  if (!account) return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({error: parsed.error.issues[0]?.message || 'Dati non validi.', field: parsed.error.issues[0]?.path.at(-1)}, {status: 400});

  try {
    await ensureOrdersPaidWebhook(getAppOrigin(request));
    // Proof of acceptance of the terms (version = their last update date).
    await createAdminClient().from('profiles').update({terms_accepted_at: new Date().toISOString(), terms_version: TERMS_VERSION}).eq('id', account.profile.id).then(({error}) => { if (error) console.error('[Terms acceptance]', error.message); });
    await updateWowproClient(account.recordId, billingToClient(parsed.data.billing));
    const client = await getWowproClient(account.recordId, {fresh: true});
    const checkoutUrl = buildSubscriptionCheckoutUrl({optionId: parsed.data.plan, email: client.fields.email_login || account.profile.email, clientRecordId: account.recordId, billing: parsed.data.billing});
    return NextResponse.json({checkoutUrl});
  } catch (error) {
    console.error('[Subscription checkout]', error);
    return NextResponse.json({error: 'Impossibile avviare il pagamento. Riprova tra qualche istante.'}, {status: 502});
  }
}
