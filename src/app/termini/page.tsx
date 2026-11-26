import type {Metadata} from 'next';

import {LEGAL, LegalPage} from '@/components/legal';

export const metadata: Metadata = {title: 'Termini del servizio · WOWPRO'};

export default function TermsPage() {
  return <LegalPage intro="Le condizioni che regolano l’abbonamento e l’uso del portale WOWPRO, il servizio di grafica, stampa e supporto dedicato di WowStampa per aziende e professionisti." title="Termini del servizio WOWPRO">
    <h2>1. Chi fornisce il servizio</h2>
    <p>Il servizio WOWPRO è fornito da {LEGAL.company}, {LEGAL.address}, P.IVA {LEGAL.vat}, email <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>, telefono {LEGAL.phone}. WOWPRO è rivolto a clienti professionali (aziende, enti e titolari di partita IVA).</p>

    <h2>2. Cosa include</h2>
    <ul>
      <li>Un portale riservato per richiedere grafiche, preventivi e ordini di stampa e seguirne l’avanzamento.</li>
      <li>Crediti grafici inclusi ogni mese, da usare per revisioni, modifiche e creazioni secondo il listino pubblicato nel portale.</li>
      <li>Prezzi riservati sui prodotti WowStampa, ordini prioritari e un account manager dedicato.</li>
      <li>Servizi aggiuntivi a crediti, come la spedizione express, quando indicati nel portale.</li>
    </ul>

    <h2>3. Account</h2>
    <p>Le credenziali sono personali. Sei responsabile delle attività svolte con il tuo account e di tenere aggiornati i dati aziendali e di fatturazione. Possiamo sospendere l’accesso in caso di uso improprio o di mancato pagamento.</p>

    <h2>4. Abbonamento, rinnovo e disdetta</h2>
    <ul>
      <li>L’abbonamento può essere mensile o annuale, al prezzo indicato al momento dell’acquisto, e si paga sul checkout di WowStampa.</li>
      <li>Si rinnova automaticamente alla scadenza per lo stesso periodo, salvo disdetta.</li>
      <li>Puoi chiedere la disdetta in qualsiasi momento dal portale o al tuo account manager: l’abbonamento resta attivo fino alla fine del periodo già pagato e non si rinnova più.</li>
      <li>Senza abbonamento attivo restano accessibili solo la pagina di benvenuto e la pagina Abbonamento.</li>
    </ul>

    <h2>5. Crediti</h2>
    <ul>
      <li>I crediti inclusi tornano al valore del piano ogni mese, alla data di attivazione (anche con l’abbonamento annuale). Quelli non usati nel mese non si accumulano.</li>
      <li>I crediti extra, acquistati a parte, non scadono finché l’account è attivo e si usano solo dopo aver esaurito quelli inclusi.</li>
      <li>I crediti non sono convertibili in denaro e non sono trasferibili ad altri account.</li>
      <li>Il costo in crediti di ogni servizio è quello indicato nel listino del portale al momento della richiesta.</li>
    </ul>

    <h2>6. Grafiche</h2>
    <ul>
      <li>Ti impegni a fornire materiali (loghi, testi, immagini, font) di cui hai i diritti d’uso, e ci autorizzi a usarli per realizzare i lavori richiesti.</li>
      <li>Ogni richiesta comprende le revisioni previste dal tipo di servizio scelto. Approvando una bozza confermi testi, contenuti e impaginazione: errori presenti in una bozza approvata non sono imputabili a WowStampa.</li>
      <li>Al saldo dei crediti o del corrispettivo, le grafiche realizzate per te possono essere usate liberamente dalla tua azienda.</li>
    </ul>

    <h2>7. Preventivi, ordini e pagamenti</h2>
    <ul>
      <li>Un preventivo è valido fino alla data indicata; dopo la scadenza può essere aggiornato.</li>
      <li>L’ordine è confermato con il pagamento con carta oppure all’accredito del bonifico. Le lavorazioni partono dopo la conferma.</li>
      <li>Tempi di produzione e spedizione indicati sono stime; la spedizione express a crediti viene rimborsata in crediti se l’ordine viene annullato prima della spedizione.</li>
      <li>Per i prodotti personalizzati, realizzati su indicazioni del cliente, il diritto di recesso non si applica. Restano valide le garanzie di legge per prodotti difettosi o non conformi, da segnalare entro 8 giorni dalla consegna.</li>
    </ul>

    <h2>8. Responsabilità</h2>
    <p>Lavoriamo con la massima cura, ma non rispondiamo di danni indiretti o di mancati guadagni. La nostra responsabilità per ciascun ordine o periodo di abbonamento non supera quanto pagato per quell’ordine o per quel periodo, salvo dolo o colpa grave.</p>

    <h2>9. Dati personali</h2>
    <p>Trattiamo i dati come descritto nell’<a href="/privacy">Informativa privacy</a> e nella <a href="/cookie">Cookie policy</a>.</p>

    <h2>10. Modifiche, legge applicabile e foro</h2>
    <p>Possiamo aggiornare questi termini; le modifiche importanti ti saranno comunicate con almeno 30 giorni di anticipo e potrai disdire prima che si applichino. Questi termini sono regolati dalla legge italiana. Per ogni controversia è competente in via esclusiva il Tribunale di Rieti.</p>
  </LegalPage>;
}
