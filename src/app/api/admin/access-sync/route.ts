import {NextResponse} from 'next/server';
import {z} from 'zod';

import {inviteFromAirtable, syncAccessFromAirtable} from '@/lib/access-sync';
import {getCurrentProfile} from '@/lib/auth';

export const maxDuration = 120;
const schema = z.object({invite: z.string().trim().email().optional()});

// "Sincronizza con Airtable" and "Invita" from the Team page.
export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== 'admin' || profile.status !== 'active') return NextResponse.json({error: 'Accesso riservato all’amministrazione.'}, {status: 403});
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({error: 'Richiesta non valida.'}, {status: 400});
  try {
    if (parsed.data.invite) {
      try { await inviteFromAirtable(parsed.data.invite); } catch (error) {
        const message = error instanceof Error && error.message.toLowerCase().includes('already') ? 'Esiste già un account con questa email: sincronizza per aggiornarne il ruolo.' : error instanceof Error ? error.message : 'Invito non inviato.';
        return NextResponse.json({error: message}, {status: 409});
      }
    }
    return NextResponse.json({report: await syncAccessFromAirtable()});
  } catch (error) {
    console.error('[Admin access sync]', error);
    return NextResponse.json({error: 'Airtable non raggiungibile. Riprova tra qualche istante.'}, {status: 502});
  }
}
