import {NextResponse} from 'next/server';
import {z} from 'zod';

import {getCurrentProfile} from '@/lib/auth';
import {logRequestEvent} from '@/lib/request-thread';
import {createAdminClient} from '@/lib/supabase/admin.server';

const schema = z.object({designerId: z.union([z.string().uuid(), z.literal('')])});

// Back-office only: assign or change the designer of a single request.
export async function POST(request: Request, {params}: {params: Promise<{requestId: string}>}) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active' || !['staff', 'admin'].includes(profile.role)) return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({error: 'Grafico non valido.'}, {status: 400});
  const {requestId} = await params;
  const admin = createAdminClient();
  let designerName = '';
  if (parsed.data.designerId) {
    const {data: designer} = await admin.from('profiles').select('full_name,email,role,status').eq('id', parsed.data.designerId).maybeSingle();
    if (!designer || designer.role !== 'graphic_operator' || designer.status !== 'active') return NextResponse.json({error: 'Il profilo scelto non è un grafico attivo.'}, {status: 400});
    designerName = designer.full_name || designer.email;
  }
  const {error} = await admin.from('graphic_requests').update({assigned_to: parsed.data.designerId || null, updated_at: new Date().toISOString()}).eq('id', requestId);
  if (error) return NextResponse.json({error: 'Assegnazione non riuscita.'}, {status: 502});
  await logRequestEvent(requestId, profile.id, 'assigned', designerName ? `Richiesta assegnata a ${designerName}.` : null, designerName ? null : 'Grafico rimosso dalla richiesta.');
  return NextResponse.json({designerName: designerName || null});
}
