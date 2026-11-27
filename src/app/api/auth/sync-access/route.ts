import {NextResponse} from 'next/server';

import {syncAccessFromAirtable} from '@/lib/access-sync';
import {createClient} from '@/lib/supabase/server';

// Called right after login: the person's role is checked against Airtable before the portal opens.
export async function POST() {
  const supabase = await createClient();
  const {data} = await supabase.auth.getClaims();
  const email = typeof data?.claims?.email === 'string' ? data.claims.email : '';
  if (!email) return NextResponse.json({error: 'Non autenticato.'}, {status: 401});
  try {
    const report = await syncAccessFromAirtable({email, userId: typeof data?.claims?.sub === 'string' ? data.claims.sub : undefined});
    return NextResponse.json({changed: report.changed.length > 0});
  } catch (error) {
    // Airtable unreachable: the login goes on with the role already saved.
    console.error('[Login access sync]', error);
    return NextResponse.json({changed: false});
  }
}
