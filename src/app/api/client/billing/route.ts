import {NextResponse} from 'next/server';

import {billingSchema, billingToClient} from '@/lib/billing';
import {getClientAccount} from '@/lib/client-account';
import {updateWowproClient} from '@/lib/integrations/airtable';

// Invoicing details saved on the client record (the same ones asked at subscription checkout).
export async function PUT(request: Request) {
  const account = await getClientAccount();
  if (!account) return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});
  const parsed = billingSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({error: parsed.error.issues[0]?.message || 'Dati non validi.', field: parsed.error.issues[0]?.path[0] || null}, {status: 400});
  try {
    await updateWowproClient(account.recordId, billingToClient(parsed.data));
  } catch (error) {
    console.error('[Client billing]', error);
    return NextResponse.json({error: 'Dati non salvati. Riprova.'}, {status: 502});
  }
  return NextResponse.json({ok: true});
}
