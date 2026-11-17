import {NextResponse} from 'next/server';

import {getClientAccount} from '@/lib/client-account';
import {countSubscriptionPayments} from '@/lib/subscription';

// Polled by the portal while the client pays: the orders/paid webhook records each subscription payment.
export async function GET() {
  const account = await getClientAccount();
  if (!account) return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});
  try {
    return NextResponse.json({payments: await countSubscriptionPayments(account.recordId)}, {headers: {'Cache-Control': 'no-store'}});
  } catch {
    return NextResponse.json({error: 'Stato non disponibile.'}, {status: 502});
  }
}
