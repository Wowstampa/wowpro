import {redirect} from 'next/navigation';
import {cache} from 'react';
import {createClient} from '@/lib/supabase/server';

export type AppRole = 'client' | 'staff' | 'admin' | 'graphic_operator';

export type CurrentProfile = {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  company_id: string | null;
  status: 'invited' | 'active' | 'suspended' | 'revoked';
};

// Once per request (layout and page share it). getClaims verifies the session JWT signature (locally with the
// project's signing keys) instead of a round trip to the Auth server on every navigation.
export const getCurrentProfile = cache(async () => {
  const supabase = await createClient();
  const {data, error} = await supabase.auth.getClaims();
  const userId = !error ? data?.claims?.sub : null;
  if (!userId) return null;

  const {data: profile} = await supabase
    .from('profiles')
    .select('id,email,full_name,role,company_id,status')
    .eq('id', userId)
    .single<CurrentProfile>();

  return profile;
});

export async function requireProfile(allowedRoles?: AppRole[]) {
  const profile = await getCurrentProfile();

  if (!profile || profile.status !== 'active') redirect('/accesso-negato');
  if (allowedRoles && !allowedRoles.includes(profile.role)) redirect('/accesso-negato');
  return profile;
}
