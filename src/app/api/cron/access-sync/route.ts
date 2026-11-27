import {NextResponse} from 'next/server';

import {syncAccessFromAirtable} from '@/lib/access-sync';

export const maxDuration = 120;

// Every 15 minutes (GitHub Action): portal roles follow manual changes in Airtable Clienti/Utenti.
// Only counts are returned: this endpoint is public.
export async function GET() {
  try {
    const report = await syncAccessFromAirtable();
    return NextResponse.json({changed: report.changed.length, pending: report.pending.length, skipped: report.skipped.length, invited: report.invited.length}, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    console.error('[Access sync]', error);
    return NextResponse.json({error: 'Sincronizzazione non riuscita.'}, {status: 500});
  }
}
