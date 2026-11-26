import {Download, FileText, Receipt} from 'lucide-react';

type InvoiceView = {id: string; name: string; size: number; orderName: string | null; postedAt: string};
const day = (value: string) => new Intl.DateTimeFormat('it-IT', {day: 'numeric', month: 'long', year: 'numeric'}).format(new Date(value));
const size = (bytes: number) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

// The client's invoices, filed by the team from Slack.
export function ClientInvoices({invoices}: {invoices: InvoiceView[]}) {
  if (!invoices.length) return <section className="dash-empty files-empty"><span><Receipt size={24} /></span><strong>Ancora nessuna fattura</strong><p>Le fatture di abbonamento, crediti e ordini compariranno qui appena emesse, con un’email di avviso.</p></section>;
  return <section className="invoices">
    <ul>{invoices.map((invoice) => <li key={invoice.id}>
      <span className="invoices__icon"><FileText size={18} /></span>
      <div><strong title={invoice.name}>{invoice.name}</strong><small>{day(invoice.postedAt)}{invoice.orderName ? ` · ordine ${invoice.orderName}` : ''} · {size(invoice.size)}</small></div>
      <a className="client-action" href={`/api/invoices/${invoice.id}`}><Download size={14} /> Scarica</a>
    </li>)}</ul>
  </section>;
}
