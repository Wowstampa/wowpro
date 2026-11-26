import {NextResponse} from 'next/server';

import {runBackup} from '@/lib/backup';
import {runMonthlyCreditResets} from '@/lib/credit-reset';
import {runQuoteReminders} from '@/lib/quotes';

export const maxDuration = 300;

// Called once a day by the scheduled GitHub Action. Every job is idempotent; a failure makes the action fail,
// and GitHub emails the repository owner.
export async function GET() {
  const report: Record<string, unknown> = {};
  let failed = false;
  for (const [name, job] of [['quoteReminders', runQuoteReminders], ['creditResets', runMonthlyCreditResets], ['backup', runBackup]] as const) {
    try { report[name] = await job(); } catch (error) { failed = true; console.error(`[Daily ${name}]`, error); report[name] = {error: error instanceof Error ? error.message : 'errore'}; }
  }
  return NextResponse.json(report, {status: failed ? 500 : 200, headers: {'Cache-Control': 'no-store'}});
}
