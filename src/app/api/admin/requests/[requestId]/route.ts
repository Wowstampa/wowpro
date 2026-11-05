import {NextResponse} from 'next/server';
import {z} from 'zod';

import {getCurrentProfile} from '@/lib/auth';
import {createAdminClient} from '@/lib/supabase/admin.server';

const updateRequestSchema = z.object({
  status: z.enum(['new', 'in_progress', 'review', 'completed', 'rejected']),
});

export async function PATCH(request: Request, {params}: {params: Promise<{requestId: string}>}) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({error: 'Non autenticato.'}, {status: 401});
  if (!['staff', 'admin'].includes(profile.role) || profile.status !== 'active') {
    return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});
  }

  const parsed = updateRequestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({error: 'Stato richiesta non valido.'}, {status: 400});

  try {
    const {requestId} = await params;
    const admin = createAdminClient();
    const update = {
      status: parsed.data.status,
      completed_at: parsed.data.status === 'completed' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };
    const {data: graphicRequest, error} = await admin
      .from('graphic_requests')
      .update(update)
      .eq('id', requestId)
      .select('id,status,completed_at,updated_at')
      .single();
    if (error || !graphicRequest) throw new Error('Richiesta non aggiornata.');

    const {error: eventError} = await admin.from('request_events').insert({
      request_id: requestId,
      actor_id: profile.id,
      event_type: 'status_changed',
      internal_note: `Stato aggiornato: ${statusLabel(parsed.data.status)}.`,
    });
    if (eventError) console.error('[Request status event]', eventError);

    return NextResponse.json({request: graphicRequest});
  } catch (error) {
    console.error('[Request update]', error);
    return NextResponse.json({error: 'Impossibile aggiornare la richiesta.'}, {status: 502});
  }
}

function statusLabel(status: 'new' | 'in_progress' | 'review' | 'completed' | 'rejected') {
  return {new: 'Nuova', in_progress: 'In lavorazione', review: 'Bozza da approvare', completed: 'Completata', rejected: 'Rifiutata'}[status];
}
