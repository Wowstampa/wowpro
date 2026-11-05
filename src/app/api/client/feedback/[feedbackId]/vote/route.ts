import {NextResponse} from 'next/server';

import {getCurrentProfile} from '@/lib/auth';
import {createAdminClient} from '@/lib/supabase/admin.server';

// Toggles the current user's vote and returns the new state.
export async function POST(_request: Request, {params}: {params: Promise<{feedbackId: string}>}) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active') return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});
  const {feedbackId} = await params;
  const admin = createAdminClient();
  const {data: existing} = await admin.from('feedback_votes').select('feedback_id').eq('feedback_id', feedbackId).eq('voter_id', profile.id).maybeSingle();
  const {error} = existing
    ? await admin.from('feedback_votes').delete().eq('feedback_id', feedbackId).eq('voter_id', profile.id)
    : await admin.from('feedback_votes').insert({feedback_id: feedbackId, voter_id: profile.id});
  if (error) return NextResponse.json({error: 'Voto non registrato.'}, {status: 502});
  const {count} = await admin.from('feedback_votes').select('*', {count: 'exact', head: true}).eq('feedback_id', feedbackId);
  return NextResponse.json({voted: !existing, votes: count || 0});
}
