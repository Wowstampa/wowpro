import {NextResponse} from 'next/server';

import {runQuoteReminders} from '@/lib/quotes';

// Called once a day by the scheduled GitHub Action: idempotent, it only acts on quotes that are due.
export async function GET() {
  try {
    return NextResponse.json(await runQuoteReminders(), {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    console.error('[Quote reminders]', error);
    return NextResponse.json({error: 'Promemoria non eseguiti.'}, {status: 500});
  }
}
