import {PageHeader} from '@/components/app-shell';
import {ClientDashboard} from '@/components/client-dashboard';
import {hasActiveSubscription} from '@/lib/access';
import {requireProfile} from '@/lib/auth';
import {getWorkspaceData} from '@/lib/dashboard-data';
import {getWowproClient} from '@/lib/integrations/airtable';
import {getConversationCompany} from '@/lib/support';
import {createClient} from '@/lib/supabase/server';

// Client home: the welcome page without a subscription, the full workspace with one.
export default async function DashboardPage() {
  const profile = await requireProfile(['client']);
  const supabase = await createClient();
  const {data: company} = await supabase.from('companies').select('name,airtable_record_id').eq('id', profile.company_id || '').maybeSingle();
  const [active, team] = await Promise.all([
    hasActiveSubscription(profile.company_id),
    profile.company_id ? getConversationCompany(profile.company_id).catch(() => null) : Promise.resolve(null),
  ]);
  const name = company?.name || profile.full_name || 'cliente';
  let managerName = team?.manager?.name || '';

  if (!active || !profile.company_id) {
    return <><PageHeader eyebrow="WOWPRO · Area cliente" title="Benvenuto" />
      <ClientDashboard active={false} manager={{id: null, name: ''}} name={name} workspace={null} />
    </>;
  }

  const workspace = await getWorkspaceData(profile.company_id, company?.airtable_record_id || null, profile.email);
  if (!managerName && company?.airtable_record_id) {
    try { managerName = (await getWowproClient(company.airtable_record_id)).fields.account_manager_nome || ''; } catch { /* Generic team name below. */ }
  }
  return <><PageHeader eyebrow="WOWPRO · Area cliente" title="Dashboard" />
    <ClientDashboard active manager={{id: team?.manager?.id || null, name: managerName}} name={name} workspace={workspace} />
  </>;
}
