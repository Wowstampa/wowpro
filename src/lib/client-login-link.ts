import 'server-only';

import {createAdminClient} from '@/lib/supabase/admin.server';

// An existing portal account with the client's login email becomes that client's account,
// even if it was created earlier as a team member (the role decides which area opens at login).
// The admin doing the change is never converted, so nobody locks themselves out.
export async function linkClientAccount(email: string, companyId: string, actorId: string): Promise<'linked' | 'unchanged' | 'self' | 'none'> {
  const admin = createAdminClient();
  const {data: account} = await admin.from('profiles').select('id,role,company_id,status').eq('email', email.trim().toLowerCase()).maybeSingle();
  if (!account) return 'none';
  if (account.id === actorId) return 'self';
  if (account.role === 'client' && account.company_id === companyId && account.status === 'active') return 'unchanged';
  const {error} = await admin.from('profiles').update({role: 'client', company_id: companyId, status: 'active'}).eq('id', account.id);
  if (error) throw error;
  // A former team member must not keep clients assigned to them.
  await admin.from('companies').update({account_manager_id: null}).eq('account_manager_id', account.id);
  await admin.from('companies').update({designer_id: null}).eq('designer_id', account.id);
  return 'linked';
}
