import {NextResponse} from 'next/server';

import {getClientAccount} from '@/lib/client-account';
import {getWowproClient} from '@/lib/integrations/airtable';

export async function GET() {
  const account = await getClientAccount();
  if (!account) return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});
  try {
    const client = await getWowproClient(account.recordId, {fresh: true});
    return NextResponse.json({extraCredits: Number(client.fields.crediti_extra_residui || 0)}, {headers: {'Cache-Control': 'no-store'}});
  } catch {
    return NextResponse.json({error: 'Saldo non disponibile.'}, {status: 502});
  }
}
