import 'server-only';

import {isActiveStatus} from '@/lib/access';
import {getWowproClient, updateWowproClient} from '@/lib/integrations/airtable';
import {REQUEST_FILES_BUCKET, ensureRequestFilesBucket} from '@/lib/request-files';
import {SUBSCRIPTION_MONTHLY_CREDITS} from '@/lib/subscription';
import {createAdminClient} from '@/lib/supabase/admin.server';

// Annual subscribers pay once a year but get their included credits every month: on the monthly anniversary of the
// payment the included credits go back to the monthly amount (unused ones are lost; extra credits are untouched).
// Monthly subscribers already get the reset with each renewal payment.

const PAYMENT_KEY = 'shopify-sub-';
const RESET_KEY = 'monthly-reset-';

// Month of the last reset for each company (kept in storage, so a month with nothing to add is remembered too).
const MARKER_PATH = 'system/credit-resets.json';
async function readMarkers(): Promise<Record<string, string>> {
  const {data} = await createAdminClient().storage.from(REQUEST_FILES_BUCKET).download(MARKER_PATH);
  if (!data) return {};
  try { return JSON.parse(await data.text()) as Record<string, string>; } catch { return {}; }
}
async function writeMarkers(markers: Record<string, string>) {
  await ensureRequestFilesBucket();
  await createAdminClient().storage.from(REQUEST_FILES_BUCKET).upload(MARKER_PATH, new Blob([JSON.stringify(markers)], {type: 'application/json'}), {upsert: true, contentType: 'application/json'});
}

// The anniversary in a given month; the 31st becomes the last day of shorter months.
function anniversary(anchor: Date, year: number, month: number) {
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(anchor.getUTCDate(), last)));
}

export async function runMonthlyCreditResets(now = new Date()) {
  const admin = createAdminClient();
  const {data: payments, error} = await admin.from('credit_transactions').select('company_id,description,created_at').like('idempotency_key', `${PAYMENT_KEY}%`).order('created_at', {ascending: false}).limit(2000);
  if (error) throw error;
  // Latest subscription payment of each company.
  const latest = new Map<string, {description: string; created_at: string}>();
  for (const payment of payments || []) if (!latest.has(payment.company_id)) latest.set(payment.company_id, payment);

  const result = {checked: 0, reset: 0, skipped: 0, errors: 0};
  const markers = await readMarkers();
  let markersChanged = false;
  for (const [companyId, payment] of latest) {
    if (!/annual/i.test(payment.description)) continue;
    result.checked += 1;
    const anchor = new Date(payment.created_at);
    const yearEnd = new Date(anchor); yearEnd.setUTCFullYear(yearEnd.getUTCFullYear() + 1);
    const due = anniversary(anchor, now.getUTCFullYear(), now.getUTCMonth());
    const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const paidThisMonth = anchor.getUTCFullYear() === now.getUTCFullYear() && anchor.getUTCMonth() === now.getUTCMonth();
    // Not yet the day, already reset by the payment itself, or the year is over (the renewal payment takes over).
    if (now < due || paidThisMonth || now >= yearEnd || markers[companyId] === monthKey) { result.skipped += 1; continue; }
    try {
      const {data: company} = await admin.from('companies').select('airtable_record_id').eq('id', companyId).maybeSingle();
      if (!company?.airtable_record_id) { result.skipped += 1; continue; }
      const client = await getWowproClient(company.airtable_record_id, {fresh: true});
      if (client.fields.stato_abbonamento && !isActiveStatus(client.fields.stato_abbonamento)) { result.skipped += 1; continue; }
      const monthly = Number(client.fields.crediti_inclusi_mese || 0) || SUBSCRIPTION_MONTHLY_CREDITS;
      const previous = Number(client.fields.crediti_inclusi_residui || 0);
      if (monthly !== previous) {
        // The idempotency key makes the daily run safe: one reset per company per month.
        const {data: transaction, error: insertError} = await admin.from('credit_transactions').insert({
          company_id: companyId, bucket: 'included', amount: monthly - previous,
          description: `Ricarica mensile abbonamento annuale: crediti inclusi ripristinati a ${monthly.toLocaleString('it-IT')}`,
          idempotency_key: `${RESET_KEY}${companyId}-${monthKey}`,
        }).select('id').single();
        if (insertError && insertError.code !== '23505') throw insertError;
        if (transaction) {
          try {
            await updateWowproClient(company.airtable_record_id, {crediti_inclusi_residui: monthly});
          } catch (updateError) {
            await admin.from('credit_transactions').delete().eq('id', transaction.id);
            throw updateError;
          }
        }
      }
      markers[companyId] = monthKey; markersChanged = true;
      result.reset += 1;
    } catch (resetError) {
      console.error('[Monthly credit reset]', companyId, resetError);
      result.errors += 1;
    }
  }
  if (markersChanged) await writeMarkers(markers);
  return result;
}
