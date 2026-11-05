import 'server-only';

import {getCurrentProfile} from '@/lib/auth';
import {canAccessConversation} from '@/lib/support';

// Shared guard: resolves the profile and the conversation the request refers to.
export async function resolveConversation(companyIdParam: string | null | undefined) {
  const profile = await getCurrentProfile();
  if (!profile) return {error: 'Non autenticato.', status: 401} as const;
  const companyId = profile.role === 'client' ? profile.company_id : companyIdParam;
  if (!companyId) return {error: 'Conversazione non trovata.', status: 404} as const;
  const company = await canAccessConversation(profile, companyId);
  if (!company) return {error: 'Conversazione non trovata.', status: 404} as const;
  return {profile, company} as const;
}
