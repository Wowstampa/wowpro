import {ChevronDown, ExternalLink, Package, Truck} from 'lucide-react';

import type {CustomerOrder} from '@/lib/integrations/shopify';

const financialLabels: Record<string, {label: string; tone: string}> = {
  PAID: {label: 'Pagato', tone: 'ok'},
  PENDING: {label: 'In attesa di pagamento', tone: 'warn'},
  AUTHORIZED: {label: 'Autorizzato', tone: 'warn'},
  PARTIALLY_PAID: {label: 'Pagato in parte', tone: 'warn'},
  PARTIALLY_REFUNDED: {label: 'Rimborsato in parte', tone: 'muted'},
  REFUNDED: {label: 'Rimborsato', tone: 'muted'},
  VOIDED: {label: 'Annullato', tone: 'muted'},
  EXPIRED: {label: 'Scaduto', tone: 'muted'},
};

const fulfillmentLabels: Record<string, {label: string; tone: string}> = {
  UNFULFILLED: {label: 'In lavorazione', tone: 'info'},
  IN_PROGRESS: {label: 'In lavorazione', tone: 'info'},
  OPEN: {label: 'In lavorazione', tone: 'info'},
  PENDING_FULFILLMENT: {label: 'In lavorazione', tone: 'info'},
  SCHEDULED: {label: 'Programmato', tone: 'info'},
  ON_HOLD: {label: 'In sospeso', tone: 'warn'},
  PARTIALLY_FULFILLED: {label: 'Spedito in parte', tone: 'info'},
  FULFILLED: {label: 'Spedito', tone: 'ok'},
  RESTOCKED: {label: 'Annullato', tone: 'muted'},
  REQUEST_DECLINED: {label: 'Richiesta rifiutata', tone: 'muted'},
};

const shipmentLabels: Record<string, string> = {
  DELIVERED: 'Consegnato',
  OUT_FOR_DELIVERY: 'In consegna',
  IN_TRANSIT: 'In transito',
  ATTEMPTED_DELIVERY: 'Tentata consegna',
  READY_FOR_PICKUP: 'Pronto per il ritiro',
  PICKED_UP: 'Ritirato',
  LABEL_PRINTED: 'Etichetta creata',
  LABEL_PURCHASED: 'Etichetta creata',
  CONFIRMED: 'Spedizione confermata',
  FULFILLED: 'Spedito',
  FAILURE: 'Problema di consegna',
  CANCELED: 'Spedizione annullata',
  NOT_DELIVERED: 'Non consegnato',
};

export function ClientOrders({orders}: {orders: CustomerOrder[]}) {
  if (!orders.length) {
    return <section className="empty-card empty-card--section"><Package size={26} className="orders-empty-icon" /><h2>Nessun ordine recente</h2><p>Gli ordini effettuati su wowstampa.it negli ultimi 60 giorni compariranno qui.</p></section>;
  }
  return <section className="orders">
    <div className="credits-section-title"><h2>I tuoi ordini</h2><p>Ordini WowStampa degli ultimi 60 giorni</p></div>
    <div className="orders__list">{orders.map((order) => <OrderCard key={order.id} order={order} />)}</div>
  </section>;
}

function OrderCard({order}: {order: CustomerOrder}) {
  const delivered = order.shipments.find((shipment) => shipment.status === 'DELIVERED');
  const fulfillment = order.cancelled
    ? {label: 'Annullato', tone: 'muted'}
    : order.creditsOnly && order.financialStatus === 'PAID' ? {label: 'Crediti accreditati', tone: 'ok'}
    : delivered ? {label: 'Consegnato', tone: 'ok'} : fulfillmentLabels[order.fulfillmentStatus || ''] || {label: 'In lavorazione', tone: 'info'};
  const financial = financialLabels[order.financialStatus || ''];
  const itemCount = order.items.length;
  const trackable = order.shipments.filter((shipment) => shipment.number || shipment.url);

  return <details className="order-card">
    <summary>
      <div className="order-card__id"><strong>Ordine {order.name}</strong><small>{date(order.createdAt)} · {itemCount} {itemCount === 1 ? 'prodotto' : 'prodotti'}</small></div>
      <div className="order-card__status"><span className={`order-pill order-pill--${fulfillment.tone}`}>{fulfillment.label}</span>{financial ? <span className={`order-pill order-pill--${financial.tone} order-pill--soft`}>{financial.label}</span> : null}</div>
      <strong className="order-card__total">{money(order.total, order.currency)}</strong>
      <ChevronDown className="order-card__chevron" size={18} />
    </summary>
    <div className="order-card__body">
      <ul className="order-items">{order.items.map((item, index) => <li key={`${item.title}-${index}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Shopify CDN images are already resized. */}
        {item.imageUrl ? <img alt="" height={52} src={item.imageUrl} width={52} /> : <span className="order-items__placeholder"><Package size={18} /></span>}
        <div><strong>{item.title}</strong>{item.variantTitle ? <small>{item.variantTitle}</small> : null}</div>
        <b>× {item.quantity}</b>
      </li>)}</ul>
      {trackable.length ? <div className="order-tracking">{trackable.map((shipment, index) => <div key={index}>
        <Truck size={17} />
        <div><strong>{shipmentLabels[shipment.status || ''] || 'Spedito'}</strong><small>{[shipment.company, shipment.number].filter(Boolean).join(' · ') || 'Tracking disponibile'}</small></div>
        {shipment.url ? <a className="client-action" href={shipment.url} rel="noreferrer" target="_blank">Traccia spedizione <ExternalLink size={14} /></a> : null}
      </div>)}</div> : null}
      {order.statusPageUrl ? <a className="order-card__link" href={order.statusPageUrl} rel="noreferrer" target="_blank">Vedi dettaglio su wowstampa.it <ExternalLink size={13} /></a> : null}
    </div>
  </details>;
}

function money(value: number, currency: string) { return new Intl.NumberFormat('it-IT', {style: 'currency', currency: currency || 'EUR'}).format(value); }
function date(value: string) { return new Intl.DateTimeFormat('it-IT', {day: '2-digit', month: 'short', year: 'numeric'}).format(new Date(value)); }
