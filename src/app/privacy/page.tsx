import type {Metadata} from 'next';

import {LEGAL, LegalPage} from '@/components/legal';

export const metadata: Metadata = {title: 'Informativa privacy · WOWPRO'};

export default function PrivacyPage() {
  return <LegalPage intro="Come trattiamo i dati personali di chi usa il portale WOWPRO (wowpro.it), ai sensi del Regolamento UE 2016/679 (GDPR) e del D.Lgs. 196/2003." title="Informativa sulla privacy">
    <h2>1. Titolare del trattamento</h2>
    <p>{LEGAL.company}, con sede legale in {LEGAL.address}, P.IVA {LEGAL.vat} (di seguito “WowStampa”). Per qualsiasi richiesta sulla privacy puoi scrivere a <a href={`mailto:${LEGAL.privacyEmail}`}>{LEGAL.privacyEmail}</a>.</p>

    <h2>2. Quali dati trattiamo</h2>
    <ul>
      <li><b>Dati dell’account:</b> nome, email di accesso, telefono, ruolo nell’azienda e azienda di appartenenza.</li>
      <li><b>Dati di fatturazione:</b> ragione sociale, partita IVA, codice fiscale, codice SDI o PEC, indirizzo della sede.</li>
      <li><b>Contenuti del servizio:</b> richieste grafiche, preventivi, ordini, messaggi con il team, file caricati (loghi, grafiche, documenti, contabili di bonifico) e brand kit.</li>
      <li><b>Dati di pagamento:</b> i pagamenti con carta avvengono sul checkout di WowStampa gestito da Shopify; noi non vediamo né conserviamo i dati della carta. Conserviamo l’esito del pagamento e l’ordine.</li>
      <li><b>Dati tecnici:</b> indirizzo IP, data e ora di accesso e informazioni sul browser registrati nei log dei server, necessari alla sicurezza.</li>
    </ul>

    <h2>3. Perché li trattiamo e su quale base</h2>
    <ul>
      <li><b>Fornire il servizio WOWPRO</b> (account, richieste, preventivi, ordini, crediti, supporto): esecuzione del contratto (art. 6.1.b GDPR).</li>
      <li><b>Fatturazione e obblighi fiscali e contabili:</b> obbligo di legge (art. 6.1.c).</li>
      <li><b>Email di servizio</b> (bozze pronte, preventivi, pagamenti, messaggi): esecuzione del contratto. Puoi scegliere quali ricevere nelle Impostazioni del portale.</li>
      <li><b>Sicurezza del portale e prevenzione degli abusi:</b> legittimo interesse (art. 6.1.f).</li>
    </ul>
    <p>Non usiamo i dati del portale per pubblicità profilata e non li vendiamo a terzi.</p>

    <h2>4. Con chi li condividiamo</h2>
    <p>Solo con i fornitori che ci servono per erogare il servizio, nominati responsabili del trattamento:</p>
    <ul>
      <li><b>Supabase</b> (database, archivio file e autenticazione);</li>
      <li><b>Render</b> (server che ospita il portale);</li>
      <li><b>Shopify</b> (catalogo, checkout, ordini e pagamenti);</li>
      <li><b>Airtable</b> (anagrafica clienti e saldo crediti);</li>
      <li><b>Resend</b> (invio delle email di servizio);</li>
      <li><b>Slack</b> (comunicazione interna del team, ad esempio per le fatture);</li>
      <li>il nostro consulente fiscale e i corrieri, per quanto necessario a fatture e spedizioni.</li>
    </ul>
    <p>Alcuni fornitori possono trattare dati fuori dallo Spazio economico europeo: in questi casi il trasferimento avviene con le garanzie previste dal GDPR (decisioni di adeguatezza o clausole contrattuali tipo della Commissione europea).</p>

    <h2>5. Per quanto tempo li conserviamo</h2>
    <ul>
      <li>Dati dell’account e contenuti del servizio: per tutta la durata del rapporto e fino a 24 mesi dopo la chiusura dell’account.</li>
      <li>File delle richieste concluse: archiviati dopo 60 giorni secondo le regole del portale; i file di cui hai bisogno puoi scaricarli dalla pagina File.</li>
      <li>Documenti fiscali e di fatturazione: 10 anni, come richiesto dalla legge.</li>
      <li>Copie di sicurezza dei dati: 14 giorni.</li>
    </ul>

    <h2>6. I tuoi diritti</h2>
    <p>Puoi chiedere in qualsiasi momento l’accesso ai tuoi dati, la rettifica, la cancellazione, la limitazione del trattamento, la portabilità e opporti al trattamento basato sul legittimo interesse, scrivendo a <a href={`mailto:${LEGAL.privacyEmail}`}>{LEGAL.privacyEmail}</a>. Rispondiamo entro 30 giorni. Hai anche il diritto di proporre reclamo al Garante per la protezione dei dati personali (<a href="https://www.garanteprivacy.it" rel="noreferrer" target="_blank">garanteprivacy.it</a>).</p>

    <h2>7. Sicurezza</h2>
    <p>Il portale usa connessioni cifrate, accessi personali protetti da password, file privati scaricabili solo tramite link temporanei e permessi separati per clienti, grafici e amministrazione. Nessun sistema è però sicuro al 100%: custodisci con cura le tue credenziali e non condividerle.</p>

    <h2>8. Modifiche</h2>
    <p>Se aggiorniamo questa informativa, pubblichiamo la nuova versione su questa pagina con la data di aggiornamento e, per le modifiche importanti, ti avvisiamo via email o nel portale.</p>
  </LegalPage>;
}
