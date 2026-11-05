import {AppShell} from '@/components/app-shell';
import {requireProfile} from '@/lib/auth';
import {getWowproClient} from '@/lib/integrations/airtable';
import {createClient} from '@/lib/supabase/server';
import {SupportWidget} from '@/components/support-widget';
import {countUnread, getConversationCompany} from '@/lib/support';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({children}: {children: React.ReactNode}) {
  const profile = await requireProfile(['client']);
  const supabase = await createClient();
  const [{data: company}, {count}] = await Promise.all([
    supabase.from('companies').select('name,airtable_record_id').eq('id', profile.company_id || '').maybeSingle(),
    supabase.from('graphic_requests').select('*', {count: 'exact', head: true}).in('status', ['new', 'in_progress']),
  ]);
  let subscription: {plan: string; monthlyCredits: number; renewalDate: string; status: string} | undefined;
  const supportPromise = countUnread(profile).catch(() => 0);
  const managerPromise = profile.company_id ? getConversationCompany(profile.company_id).then((item) => item?.manager?.name || null).catch(() => null) : Promise.resolve(null);
  if (company?.airtable_record_id) {
    try {
      const client = await getWowproClient(company.airtable_record_id);
      subscription = {
        plan: client.fields.piano ? `WOWPRO ${client.fields.piano}` : 'WOWPRO',
        monthlyCredits: Number(client.fields.crediti_inclusi_mese || 0),
        renewalDate: client.fields.data_rinnovo_piano || '',
        status: client.fields.stato_abbonamento || 'Attivo',
      };
    } catch { /* The portal remains available if the Airtable subscription cannot be read. */ }
  }
  const [support, managerName] = await Promise.all([supportPromise, managerPromise]);
  return <AppShell mode="client" notificationCounts={{requests: count || 0, feedback: 0, support}} operatorName={company?.name || profile.full_name || profile.email} subscription={subscription}>{children}<SupportWidget initialUnread={support} managerName={managerName} /></AppShell>;
}
