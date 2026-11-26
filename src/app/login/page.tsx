import Image from 'next/image';
import {LegalFooter} from '@/components/legal';
import {LoginForm} from './login-form';

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand brand--login">
          <Image alt="WOWPRO" className="brand__logo" priority unoptimized height={64} src="/images/wowpro-logo.svg" width={183} />
          <small>by WowStampa</small>
        </div>
        <div className="login-copy">
          <span className="eyebrow">AREA CLIENTI PREMIUM</span>
          <h1>Il tuo team creativo,<br />sempre a portata di mano.</h1>
          <p>Gestisci crediti, richieste grafiche e ordini da un unico spazio riservato.</p>
        </div>
        <LoginForm />
        <LegalFooter compact />
      </section>
      <aside className="login-art" aria-hidden="true">
        <div className="login-art__orb login-art__orb--one" />
        <div className="login-art__orb login-art__orb--two" />
        <p>WOWPRO</p>
        <strong>Più velocità.<br />Più controllo.<br />Più valore.</strong>
      </aside>
    </main>
  );
}
