import 'server-only';

import {NextResponse} from 'next/server';

import {hasActiveSubscription, subscriptionRequired} from '@/lib/access';
import {getCurrentProfile} from '@/lib/auth';
import {canEditBrandKit, canReadBrandKit} from '@/lib/brand-kit';

// Resolves whose brand kit a request refers to: the client's own, or the company named by a team member.
export async function resolveBrandKit(companyIdParam: string | null | undefined, mode: 'read' | 'edit') {
  const profile = await getCurrentProfile();
  if (!profile) return {response: NextResponse.json({error: 'Non autenticato.'}, {status: 401})} as const;
  const companyId = profile.role === 'client' ? profile.company_id : companyIdParam;
  if (!companyId || !/^[0-9a-f-]{36}$/i.test(companyId)) return {response: NextResponse.json({error: 'Brand kit non trovato.'}, {status: 404})} as const;
  const allowed = mode === 'read' ? await canReadBrandKit(profile, companyId) : await canEditBrandKit(profile, companyId);
  if (!allowed) return {response: NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403})} as const;
  if (mode === 'edit' && profile.role === 'client' && !(await hasActiveSubscription(companyId))) return {response: subscriptionRequired()} as const;
  return {profile, companyId} as const;
}
