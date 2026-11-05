import {NextResponse} from 'next/server';

import {getCurrentProfile} from '@/lib/auth';
import {listConversations} from '@/lib/support';

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active' || !['staff', 'admin'].includes(profile.role)) return NextResponse.json({error: 'Accesso non autorizzato.'}, {status: 403});
  return NextResponse.json({conversations: await listConversations(profile)}, {headers: {'Cache-Control': 'no-store'}});
}
