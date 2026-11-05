import {NextResponse} from 'next/server';

import {getCurrentProfile} from '@/lib/auth';
import {getAccessibleRequest} from '@/lib/request-files';
import {getRequestThread} from '@/lib/request-thread';

export async function GET(_request: Request, {params}: {params: Promise<{requestId: string}>}) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({error: 'Non autenticato.'}, {status: 401});
  const {requestId} = await params;
  if (!(await getAccessibleRequest(profile, requestId))) return NextResponse.json({error: 'Richiesta non trovata.'}, {status: 404});
  try {
    const thread = await getRequestThread(profile, requestId);
    if (!thread) return NextResponse.json({error: 'Richiesta non trovata.'}, {status: 404});
    return NextResponse.json(thread, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    console.error('[Request thread]', error);
    return NextResponse.json({error: 'Richiesta non disponibile.'}, {status: 502});
  }
}
