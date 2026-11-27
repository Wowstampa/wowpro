import {AppShell} from '@/components/app-shell';
import {requireProfile} from '@/lib/auth';
import {getWowproClient} from '@/lib/integrations/airtable';
import {createAdminClient} from '@/lib/supabase/admin.server';
import {SupportWidget} from '@/components/support-widget';
import {countUnread, getConversationCompany} from '@/lib/support';
import {hasActiveSubscription} from '@/lib/access';
import {getEarlyPromos} from '@/lib/promo-view';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({children}: {children: React.ReactNode}) {
  const profile = await requireProfile(['client']);
  const admin = createAdminClient();
  const companyId = profile.company_id || '';
  const today = new Date().toISOString().slice(0, 10);
  // Everything the shell needs is read in parallel: this runs on every page change.
  const [{data: company}, {count: toApprove}, {data: quoted}, active, support, team, earlyPromos] = await Promise.all([
    admin.from('companies').select('name,airtable_record_id').eq('id', companyId).maybeSingle(),
    // The Richieste badge counts what waits for the client: drafts to approve and quotes to pay.
    admin.from('graphic_requests').select('id', {count: 'exact', head: true}).eq('company_id', companyId).eq('status', 'review'),
    admin.from('quote_requests').select('offer').eq('company_id', companyId).eq('status', 'quoted').is('order_name', null).limit(50),
    hasActiveSubscription(profile.company_id),
    countUnread(profile).catch(() => 0),
    profile.company_id ? getConversationCompany(profile.company_id).catch(() => null) : Promise.resolve(null),
    getEarlyPromos(),
  ]);
  const freshPromos = active ? earlyPromos.map((promo) => promo.id) : [];
  const toPay = (quoted || []).filter((row) => { const until = (row.offer as {validUntil?: string | null} | null)?.validUntil; return !until || until >= today; }).length;
  let subscription: {plan: string; monthlyCredits: number; renewalDate: string; status: string; included: number; extra: number} | undefined;
  if (company?.airtable_record_id) {
    try {
      // Cached for 60 seconds (pages that change credits read it fresh).
      const client = await getWowproClient(company.airtable_record_id);
      subscription = {
        plan: client.fields.piano ? `WOWPRO ${client.fields.piano}` : 'WOWPRO',
        monthlyCredits: Number(client.fields.crediti_inclusi_mese || 0),
        renewalDate: client.fields.data_rinnovo_piano || '',
        included: Number(client.fields.crediti_inclusi_residui || 0),
        extra: Number(client.fields.crediti_extra_residui || 0),
        // Active = paid on Shopify or set "Attivo" by the team in Airtable.
        status: active ? client.fields.stato_abbonamento || 'Attivo' : 'non attivo',
      };
    } catch { /* The portal remains available if the Airtable subscription cannot be read. */ }
  }
  return <AppShell freshPromos={freshPromos} locked={!active} mode="client" notificationCounts={{requests: (toApprove || 0) + toPay, feedback: 0, support}} operatorName={company?.name || profile.full_name || profile.email} subscription={subscription}>{children}<SupportWidget initialUnread={support} managerName={team?.manager?.name || null} /></AppShell>;
}
