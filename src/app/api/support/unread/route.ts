import {NextResponse} from 'next/server';

import {getCurrentProfile} from '@/lib/auth';
import {countUnread} from '@/lib/support';

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active') return NextResponse.json({unread: 0}, {status: 401});
  return NextResponse.json({unread: await countUnread(profile).catch(() => 0)}, {headers: {'Cache-Control': 'no-store'}});
}
