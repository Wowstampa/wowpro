import {AppShell} from '@/components/app-shell';
import {requireProfile} from '@/lib/auth';
import {getWowproClient} from '@/lib/integrations/airtable';
import {createAdminClient} from '@/lib/supabase/admin.server';
import {createClient} from '@/lib/supabase/server';
import {SupportWidget} from '@/components/support-widget';
import {countUnread, getConversationCompany} from '@/lib/support';
import {hasActiveSubscription} from '@/lib/access';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({children}: {children: React.ReactNode}) {
  const profile = await requireProfile(['client']);
  const supabase = await createClient();
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  // The Richieste badge counts what waits for the client: drafts to approve and quotes to pay.
  const [{data: company}, {count: toApprove}, {data: quoted}] = await Promise.all([
    supabase.from('companies').select('name,airtable_record_id').eq('id', profile.company_id || '').maybeSingle(),
    admin.from('graphic_requests').select('id', {count: 'exact', head: true}).eq('company_id', profile.company_id || '').eq('status', 'review'),
    admin.from('quote_requests').select('offer').eq('company_id', profile.company_id || '').eq('status', 'quoted').is('order_name', null).limit(50),
  ]);
  const toPay = (quoted || []).filter((row) => { const until = (row.offer as {validUntil?: string | null} | null)?.validUntil; return !until || until >= today; }).length;
  let subscription: {plan: string; monthlyCredits: number; renewalDate: string; status: string; included: number; extra: number} | undefined;
  const supportPromise = countUnread(profile).catch(() => 0);
  const managerPromise = profile.company_id ? getConversationCompany(profile.company_id).then((item) => item?.manager?.name || null).catch(() => null) : Promise.resolve(null);
  const active = await hasActiveSubscription(profile.company_id);
  if (company?.airtable_record_id) {
    try {
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
  const [support, managerName] = await Promise.all([supportPromise, managerPromise]);
  return <AppShell locked={!active} mode="client" notificationCounts={{requests: (toApprove || 0) + toPay, feedback: 0, support}} operatorName={company?.name || profile.full_name || profile.email} subscription={subscription}>{children}<SupportWidget initialUnread={support} managerName={managerName} /></AppShell>;
}
