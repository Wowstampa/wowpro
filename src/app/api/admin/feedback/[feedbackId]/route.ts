import {after, NextResponse} from 'next/server';
import {z} from 'zod';

import {getCurrentProfile} from '@/lib/auth';
import {createAdminClient} from '@/lib/supabase/admin.server';
import {notifyIdeaUpdate} from '@/lib/feedback-notify';

const updateFeedbackSchema = z.object({
  status: z.enum(['new', 'evaluating', 'implementing', 'completed', 'rejected']),
  publicResponse: z.string().trim().max(2_000),
  internalNote: z.string().trim().max(2_000),
});

export async function PATCH(request: Request, {params}: {params: Promise<{feedbackId: string}>}) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({error: 'Non autenticato.'}, {status: 401});
  if (!['staff', 'admin'].includes(profile.role) || profile.status !== 'active') return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});

  const parsed = updateFeedbackSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({error: 'Dati feedback non validi.'}, {status: 400});

  try {
    const {feedbackId} = await params;
    const {data: before} = await createAdminClient().from('feedback').select('title,status,public_response').eq('id', feedbackId).maybeSingle();
    const {data, error} = await createAdminClient()
      .from('feedback')
      .update({
        status: parsed.data.status,
        public_response: parsed.data.publicResponse || null,
        internal_note: parsed.data.internalNote || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', feedbackId)
      .select('id,status,public_response,internal_note,updated_at')
      .single();
    if (error || !data) throw new Error('Feedback non aggiornato.');
    // Author and voters hear about a new status or a new public reply.
    const statusChanged = before && before.status !== data.status;
    const replyChanged = before && (data.public_response || '') !== (before.public_response || '') && !!data.public_response;
    if (before && (statusChanged || replyChanged)) after(() => notifyIdeaUpdate({id: feedbackId, title: before.title}, {status: statusChanged ? data.status : undefined, response: replyChanged ? data.public_response || '' : undefined}).catch((error) => console.error('[Idea notify]', error)));
    return NextResponse.json({feedback: {
      status: data.status,
      publicResponse: data.public_response || '',
      internalNote: data.internal_note || '',
    }});
  } catch (error) {
    console.error('[Feedback update]', error);
    return NextResponse.json({error: 'Impossibile aggiornare il feedback.'}, {status: 502});
  }
}
