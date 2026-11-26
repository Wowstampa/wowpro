import 'server-only';

import type {AirtableWowproClient} from '@/lib/integrations/airtable';
import {createAdminClient} from '@/lib/supabase/admin.server';

export type AdminMetrics = {
  creditsUsed: number; creditsUsedPrev: number;
  ordersCount: number; ordersRevenue: number; ordersPrev: number;
  firstDraftHours: number | null; firstDraftSample: number; approvalRate: number | null;
  expiring: Array<{name: string; date: string; days: number}>;
  lowCredits: Array<{name: string; left: number; monthly: number}>;
};

const monthStart = (offset = 0) => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth() + offset, 1).toISOString(); };

// Business numbers for the admin overview: consumption, print orders, design turnaround, renewals.
export async function getAdminMetrics(clients: Array<{fields: AirtableWowproClient}>): Promise<AdminMetrics> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const [{data: debits}, {data: paid}, {data: requests}, {data: reviews}] = await Promise.all([
    admin.from('credit_transactions').select('amount,created_at').lt('amount', 0).gte('created_at', monthStart(-1)),
    admin.from('quote_requests').select('quote_total,paid_at').eq('status', 'paid').gte('paid_at', monthStart(-1)),
    admin.from('graphic_requests').select('id,status,created_at').gte('created_at', since),
    admin.from('request_events').select('request_id,created_at').eq('event_type', 'status_review').gte('created_at', since).order('created_at'),
  ]);
  const thisMonth = monthStart();
  const sum = (rows: Array<{amount: number}>) => rows.reduce((total, row) => total + Math.abs(Number(row.amount)), 0);
  const creditsUsed = sum((debits || []).filter((row) => row.created_at >= thisMonth));
  const creditsUsedPrev = sum((debits || []).filter((row) => row.created_at < thisMonth));
  const paidNow = (paid || []).filter((row) => (row.paid_at || '') >= thisMonth);

  // Hours from the request to the first draft sent for approval.
  const firstReview = new Map<string, string>();
  for (const event of reviews || []) if (!firstReview.has(event.request_id)) firstReview.set(event.request_id, event.created_at);
  const durations = (requests || []).flatMap((request) => { const at = firstReview.get(request.id); return at ? [(new Date(at).getTime() - new Date(request.created_at).getTime()) / 3_600_000] : []; });
  const closed = (requests || []).filter((request) => request.status === 'completed' || request.status === 'rejected');

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const active = clients.filter(({fields}) => !fields.archiviato && /^\s*attiv/i.test(fields.stato_abbonamento || ''));
  const expiring = active.flatMap(({fields}) => {
    if (!fields.data_rinnovo_piano) return [];
    const days = Math.round((new Date(`${fields.data_rinnovo_piano}T12:00:00`).getTime() - today.getTime()) / 86_400_000);
    return days >= 0 && days <= 14 ? [{name: fields.ragione_sociale || fields.cliente_id || 'Cliente', date: fields.data_rinnovo_piano, days}] : [];
  }).sort((a, b) => a.days - b.days).slice(0, 8);
  const lowCredits = active.flatMap(({fields}) => {
    const monthly = Number(fields.crediti_inclusi_mese || 0); const left = Number(fields.crediti_inclusi_residui || 0) + Number(fields.crediti_extra_residui || 0);
    return monthly && left < monthly * 0.15 ? [{name: fields.ragione_sociale || fields.cliente_id || 'Cliente', left, monthly}] : [];
  }).sort((a, b) => a.left - b.left).slice(0, 8);

  return {
    creditsUsed, creditsUsedPrev,
    ordersCount: paidNow.length, ordersRevenue: paidNow.reduce((total, row) => total + Number(row.quote_total || 0), 0), ordersPrev: (paid || []).length - paidNow.length,
    firstDraftHours: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null, firstDraftSample: durations.length,
    approvalRate: closed.length ? Math.round((closed.filter((request) => request.status === 'completed').length / closed.length) * 100) : null,
    expiring, lowCredits,
  };
}
