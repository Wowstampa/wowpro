'use client';

import {FormEvent, useState} from 'react';
import {ArrowRight, Mail} from 'lucide-react';
import {useRouter} from 'next/navigation';

import {PasswordInput} from '@/components/password-input';
import {createClient} from '@/lib/supabase/client';

export function AdminLoginForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setIsSubmitting(true);
    const supabase = createClient();
    try {
      const form = new FormData(event.currentTarget);
      const {data, error: signInError} = await supabase.auth.signInWithPassword({email: email.trim(), password: String(form.get('password') || '')});
      if (signInError || !data.user) throw new Error('Email o password non corrette.');
      const {data: profile} = await supabase.from('profiles').select('role,status').eq('id', data.user.id).maybeSingle();
      if (!profile || profile.status !== 'active' || !['admin', 'staff', 'graphic_operator'].includes(profile.role)) {
        await supabase.auth.signOut();
        throw new Error('Questo accesso è riservato al team WOWPRO.');
      }
      router.push('/auth/redirect');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Accesso non riuscito.'); setIsSubmitting(false); }
  }

  async function requestPasswordSetup() {
    if (!email.trim()) { setError('Inserisci prima la tua email aziendale.'); return; }
    setError(''); setResetSent(false);
    const {error: resetError} = await createClient().auth.resetPasswordForEmail(email.trim(), {redirectTo: `${window.location.origin}/auth/callback?next=/auth/set-password`});
    if (resetError) { setError('Non è stato possibile inviare il link. Riprova tra poco.'); return; }
    setResetSent(true);
  }

  return <form className="login-form" onSubmit={submit}>
    <label htmlFor="staff-email">Email aziendale</label><div className="input-wrap"><Mail aria-hidden="true" size={18} /><input autoComplete="email" id="staff-email" name="email" onChange={(event) => setEmail(event.target.value)} placeholder="nome@wowstampa.it" required type="email" value={email} /></div>
    <label htmlFor="staff-password">Password</label><PasswordInput autoComplete="current-password" id="staff-password" name="password" />
    {error ? <p className="login-error">{error}</p> : null}
    <button className="button button--primary" disabled={isSubmitting} type="submit">{isSubmitting ? 'Accesso in corso...' : 'Accedi al pannello'} <ArrowRight aria-hidden="true" size={18} /></button>
    <button className="login-reset-link" onClick={() => void requestPasswordSetup()} type="button">Imposta o reimposta la password</button>
    {resetSent ? <p className="login-reset-notice">Se l&apos;email è abilitata, riceverai a breve un link sicuro per impostare la password.</p> : null}
  </form>;
}
