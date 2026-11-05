import 'server-only';

import {getCurrentProfile} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';

// Resolves the logged-in client and the Airtable record of their company.
export async function getClientAccount() {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active' || profile.role !== 'client') return null;
  const supabase = await createClient();
  const {data: company} = await supabase.from('companies').select('id,airtable_record_id').eq('id', profile.company_id || '').maybeSingle();
  if (!company?.airtable_record_id) return null;
  return {profile, companyId: company.id as string, recordId: company.airtable_record_id as string};
}

export function getAppOrigin(request: Request) {
  return process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).origin : new URL(request.url).origin;
}
