import {NextResponse} from 'next/server';
import {z} from 'zod';

import {getAppOrigin, getClientAccount} from '@/lib/client-account';
import {getWowproClient} from '@/lib/integrations/airtable';
import {buildCreditsCheckoutUrl, ensureOrdersPaidWebhook, listCreditPackages} from '@/lib/integrations/shopify';

const checkoutSchema = z.object({variantId: z.string().regex(/^\d+$/)});

export async function POST(request: Request) {
  const account = await getClientAccount();
  if (!account) return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});
  const parsed = checkoutSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({error: 'Pacchetto non valido.'}, {status: 400});

  try {
    await ensureOrdersPaidWebhook(getAppOrigin(request));
    const creditPackage = (await listCreditPackages()).find((item) => item.variantId === parsed.data.variantId);
    if (!creditPackage) return NextResponse.json({error: 'Pacchetto non disponibile.'}, {status: 404});
    const client = await getWowproClient(account.recordId, {fresh: true});
    const checkoutUrl = buildCreditsCheckoutUrl({variantId: creditPackage.variantId, email: client.fields.email_login || account.profile.email, clientRecordId: account.recordId});
    return NextResponse.json({checkoutUrl, credits: creditPackage.credits, baselineExtra: Number(client.fields.crediti_extra_residui || 0)});
  } catch (error) {
    console.error('[Credit checkout]', error);
    return NextResponse.json({error: 'Impossibile avviare il pagamento. Riprova tra qualche istante.'}, {status: 502});
  }
}
