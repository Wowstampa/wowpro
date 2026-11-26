import type {Metadata} from 'next';

import {LEGAL, LegalPage} from '@/components/legal';

export const metadata: Metadata = {title: 'Cookie policy · WOWPRO'};

export default function CookiePage() {
  return <LegalPage intro="Quali cookie e strumenti simili usa il portale WOWPRO (wowpro.it)." title="Cookie policy">
    <h2>Solo cookie tecnici</h2>
    <p>Il portale usa esclusivamente cookie tecnici, necessari a farlo funzionare. Non usiamo cookie di profilazione, pubblicitari o di statistica di terze parti: per questo non ti chiediamo un consenso.</p>
    <table className="legal__table"><thead><tr><th>Cookie / dato</th><th>A cosa serve</th><th>Durata</th></tr></thead><tbody>
      <tr><td>Sessione di accesso (sb-…-auth-token)</td><td>Ti tiene collegato al tuo account in modo sicuro.</td><td>Fino all’uscita o alla scadenza della sessione</td></tr>
      <tr><td>Preferenze locali del browser</td><td>Ricordano piccole scelte, come aver nascosto la lista dei primi passi o un riordino in corso.</td><td>Finché non cancelli i dati del browser</td></tr>
    </tbody></table>
    <h2>Pagamenti e siti esterni</h2>
    <p>Quando paghi vieni portato sul checkout di WowStampa gestito da Shopify, che usa i propri cookie secondo la sua informativa. Lo stesso vale per i link a corrieri e ad altri siti esterni.</p>
    <h2>Come gestirli</h2>
    <p>Puoi cancellare i cookie dalle impostazioni del browser: in questo caso dovrai rifare l’accesso al portale. Per domande scrivi a <a href={`mailto:${LEGAL.privacyEmail}`}>{LEGAL.privacyEmail}</a>.</p>
  </LegalPage>;
}
