import {NextResponse} from 'next/server';

import {getAppOrigin, getClientAccount} from '@/lib/client-account';
import {ensureOrdersPaidWebhook, listCreditPackages} from '@/lib/integrations/shopify';

export async function GET(request: Request) {
  const account = await getClientAccount();
  if (!account) return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});

  // Make sure Shopify notifies WOWPRO of paid orders before anyone can buy.
  ensureOrdersPaidWebhook(getAppOrigin(request)).catch((error) => console.error('[Shopify webhook setup]', error));

  try {
    return NextResponse.json({packages: await listCreditPackages()});
  } catch (error) {
    console.error('[Credit packages]', error);
    return NextResponse.json({error: 'Pacchetti non disponibili al momento. Riprova tra qualche istante.'}, {status: 502});
  }
}
