'use client';

import {FormEvent, useState} from 'react';
import {ArrowRight, Mail} from 'lucide-react';
import {useRouter} from 'next/navigation';

import {PasswordInput} from '@/components/password-input';
import {createClient} from '@/lib/supabase/client';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetState, setResetState] = useState<'idle' | 'sending' | 'sent'>('idle');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setIsSubmitting(true);
    const supabase = createClient();
    try {
      const form = new FormData(event.currentTarget);
      const {data, error: signInError} = await supabase.auth.signInWithPassword({email: email.trim(), password: String(form.get('password') || '')});
      if (signInError || !data.user) throw new Error('Email o password non corrette.');
      const {data: profile} = await supabase.from('profiles').select('status').eq('id', data.user.id).maybeSingle();
      if (!profile || profile.status !== 'active') {
        await supabase.auth.signOut();
        throw new Error('Questo account non è abilitato a WOWPRO. Contatta il tuo account manager.');
      }
      // The redirect route sends each role to its own area.
      router.push('/auth/redirect');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Accesso non riuscito.');
      setIsSubmitting(false);
    }
  }

  async function requestPasswordSetup() {
    if (!email.trim()) { setError('Inserisci prima la tua email aziendale.'); return; }
    setError(''); setResetState('sending');
    await createClient().auth.resetPasswordForEmail(email.trim(), {redirectTo: `${window.location.origin}/auth/callback?next=/auth/set-password`});
    // Same message whether or not the address exists, so the form never reveals who is enabled.
    setResetState('sent');
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label htmlFor="email">Email aziendale</label>
      <div className="input-wrap">
        <Mail size={18} aria-hidden="true" />
        <input autoComplete="email" id="email" name="email" onChange={(event) => setEmail(event.target.value)} placeholder="nome@azienda.it" required type="email" value={email} />
      </div>
      <label htmlFor="password">Password</label>
      <PasswordInput autoComplete="current-password" id="password" name="password" />
      {error ? <p className="login-error">{error}</p> : null}
      <button className="button button--primary" disabled={isSubmitting} type="submit">
        {isSubmitting ? 'Accesso in corso…' : 'Accedi'}
        <ArrowRight size={18} aria-hidden="true" />
      </button>
      <button className="login-reset-link" disabled={resetState === 'sending'} onClick={() => void requestPasswordSetup()} type="button">Primo accesso o password dimenticata?</button>
      {resetState === 'sent' ? <p className="login-reset-notice">Se l&apos;email è abilitata a WOWPRO, riceverai a breve un link per impostare la password.</p> : null}
    </form>
  );
}
