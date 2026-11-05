import {NextResponse} from 'next/server';
import {z} from 'zod';

import {getCurrentProfile} from '@/lib/auth';
import {FEEDBACK_CATEGORIES} from '@/lib/feedback-categories';
import {createAdminClient} from '@/lib/supabase/admin.server';

const schema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES),
  title: z.string().trim().min(5).max(120),
  description: z.string().trim().min(10).max(2000),
});

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active' || profile.role !== 'client' || !profile.company_id) return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({error: 'Inserisci un titolo (almeno 5 caratteri) e una descrizione (almeno 10).'}, {status: 400});

  const admin = createAdminClient();
  const publicId = `FB-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
  const {data, error} = await admin.from('feedback').insert({public_id: publicId, company_id: profile.company_id, author_id: profile.id, ...parsed.data}).select('id,created_at').single();
  if (error || !data) {
    console.error('[Feedback create]', error);
    return NextResponse.json({error: 'Proposta non inviata. Riprova.'}, {status: 502});
  }
  // The author automatically supports their own idea.
  await admin.from('feedback_votes').insert({feedback_id: data.id, voter_id: profile.id});
  return NextResponse.json({feedback: {id: data.id, createdAt: data.created_at}}, {status: 201});
}
