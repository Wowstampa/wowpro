import {NextResponse} from 'next/server';
import type {EmailOtpType} from '@supabase/supabase-js';
import {createClient} from '@/lib/supabase/server';

function getAppOrigin(requestUrl: URL) {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (configuredUrl) return new URL(configuredUrl).origin;
  return requestUrl.origin;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const appOrigin = getAppOrigin(url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const otpType = url.searchParams.get('type') as EmailOtpType | null;
  const requestedNext = url.searchParams.get('next');
  const next = requestedNext?.startsWith('/') && !requestedNext.startsWith('//')
    ? requestedNext
    : '/dashboard/home';

  if (code || (tokenHash && otpType)) {
    const supabase = await createClient();
    // Email links (invite, recovery) carry a token_hash; OAuth/PKCE flows carry a code.
    const {error} = tokenHash && otpType
      ? await supabase.auth.verifyOtp({type: otpType, token_hash: tokenHash})
      : await supabase.auth.exchangeCodeForSession(code!);
    if (!error) {
      const {data: {user}} = await supabase.auth.getUser();
      const {data: profile} = user
        ? await supabase.from('profiles').select('role,status').eq('id', user.id).single()
        : {data: null};

      if (profile?.status === 'active') {
        const destination = next === '/auth/set-password' ? next : profile.role === 'graphic_operator' ? '/operatore' : ['staff', 'admin'].includes(profile.role) ? '/admin' : next;
        return NextResponse.redirect(new URL(destination, appOrigin));
      }
    }
  }

  return NextResponse.redirect(new URL('/login?error=link-non-valido', appOrigin));
}
