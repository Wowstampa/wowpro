import Link from 'next/link';
import {ArrowLeft, ArrowRight, Coins, Headphones, LayoutDashboard, Lightbulb, Lock, MessageSquareText, Package, Palette, FolderOpen, Settings} from 'lucide-react';

const SECTIONS: Record<string, {label: string; text: string; icon: typeof Lock}> = {
  workspace: {label: 'La tua Dashboard', text: 'Il workspace con richieste in corso, ordini, crediti e il tuo account manager dedicato.', icon: LayoutDashboard},
  richieste: {label: 'Richieste', text: 'Richieste grafiche e preventivi di stampa, con il team WowStampa che segue ogni lavoro.', icon: MessageSquareText},
  'brand-kit': {label: 'Brand kit', text: 'Logo, colori, font e file aziendali sempre pronti per il tuo grafico.', icon: Palette},
  fatture: {label: 'Fatture', text: 'Tutte le fatture di abbonamento, crediti e ordini, sempre scaricabili.', icon: FolderOpen},
  file: {label: 'File', text: 'Tutte le grafiche consegnate dal team, pronte da riscaricare o mandare in stampa.', icon: FolderOpen},
  impostazioni: {label: 'Impostazioni', text: 'Profilo, dati di fatturazione e persone con accesso al portale.', icon: Settings},
  ordini: {label: 'Ordini', text: 'Lo storico dei tuoi ordini, i pagamenti e le spedizioni in un unico posto.', icon: Package},
  crediti: {label: 'Crediti', text: 'I crediti grafici inclusi ogni mese, quelli extra e tutti i movimenti.', icon: Coins},
  supporto: {label: 'Messaggi', text: 'Il canale diretto con il tuo account manager dedicato.', icon: Headphones},
  feedback: {label: 'Feedback & idee', text: 'Proponi idee e vota le novità della piattaforma insieme agli altri clienti.', icon: Lightbulb},
};

// Shown in place of a client section when the WOWPRO subscription is not active.
export function LockedSection({section}: {section: string}) {
  const item = SECTIONS[section] || {label: 'Questa sezione', text: 'Tutti gli strumenti del workspace WOWPRO.', icon: Lock};
  const Icon = item.icon;
  return <main className="page-content locked">
    <section className="locked-card">
      <div aria-hidden="true" className="locked-card__badge"><span><Icon size={30} /></span><i><Lock size={16} strokeWidth={2.6} /></i></div>
      <span className="dash-pill"><i /> Riservato agli abbonati</span>
      <h2>{item.label} si sblocca con WOWPRO</h2>
      <p>{item.text} Attiva l’abbonamento per accedere a tutto il workspace.</p>
      <div className="locked-card__actions">
        <Link className="dash-btn dash-btn--primary" href="/dashboard/abbonamento">Attiva l’abbonamento <ArrowRight size={17} /></Link>
        <Link className="dash-btn dash-btn--glass" href="/dashboard"><ArrowLeft size={16} /> Torna alla home</Link>
      </div>
    </section>
  </main>;
}
