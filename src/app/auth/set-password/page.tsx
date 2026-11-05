'use client';

import {FormEvent, useEffect, useState} from 'react';
import {Check} from 'lucide-react';
import {useRouter} from 'next/navigation';

import {PasswordInput} from '@/components/password-input';
import {createClient} from '@/lib/supabase/client';

export default function SetPasswordPage() {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false); const [isSaving, setIsSaving] = useState(false); const [error, setError] = useState(''); const [invalidLink, setInvalidLink] = useState('');
  useEffect(() => { void createClient().auth.getUser().then(({data}) => { if (!data.user) setInvalidLink('Il link non è valido o non è più attivo.'); setIsReady(true); }); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const password = String(form.get('password') || ''); const confirmation = String(form.get('confirmation') || ''); if (password !== confirmation) { setError('Le due password non coincidono.'); return; } setError(''); setIsSaving(true); const {error: updateError} = await createClient().auth.updateUser({password}); if (updateError) { setError(updateError.message); setIsSaving(false); return; } router.push('/auth/redirect'); }
  return <main className="login-page login-page--staff"><section className="login-card"><div className="brand brand--login"><span className="brand__mark">W</span><span><strong>WOWPRO</strong><small>by WowStampa</small></span></div><div className="login-copy"><span className="eyebrow">CREDENZIALI PERSONALI</span><h1>Imposta la tua password.</h1><p>Scegli la password che userai per accedere a WOWPRO insieme alla tua email.</p></div>{isReady && invalidLink ? <p className="login-error">{invalidLink}</p> : null}{isReady && !invalidLink ? <form className="login-form" onSubmit={submit}><label htmlFor="password">Nuova password</label><PasswordInput autoComplete="new-password" id="password" minLength={12} name="password" /><label htmlFor="confirmation">Conferma password</label><PasswordInput autoComplete="new-password" id="confirmation" minLength={12} name="confirmation" />{error ? <p className="login-error">{error}</p> : null}<button className="button button--primary" disabled={isSaving} type="submit"><Check size={18} />{isSaving ? 'Salvataggio...' : 'Salva e accedi'}</button><p className="login-help">Usa almeno 12 caratteri.</p></form> : null}</section><aside aria-hidden="true" className="login-art"><div className="login-art__orb login-art__orb--one" /><div className="login-art__orb login-art__orb--two" /><p>WOWPRO</p><strong>Accesso sicuro,<br />lavoro coordinato.</strong></aside></main>;
}
