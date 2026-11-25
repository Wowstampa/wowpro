import type {CustomerOrder} from '@/lib/integrations/shopify';

export const SHIPMENT_LABELS: Record<string, string> = {
  DELIVERED: 'Consegnato', OUT_FOR_DELIVERY: 'In consegna', IN_TRANSIT: 'In transito', ATTEMPTED_DELIVERY: 'Tentata consegna',
  READY_FOR_PICKUP: 'Pronto per il ritiro', PICKED_UP: 'Ritirato', LABEL_PRINTED: 'Etichetta creata', LABEL_PURCHASED: 'Etichetta creata',
  CONFIRMED: 'Spedizione confermata', FULFILLED: 'Spedito', FAILURE: 'Problema di consegna', CANCELED: 'Spedizione annullata', NOT_DELIVERED: 'Non consegnato',
};

export type OrderStage = 'production' | 'shipped' | 'delivered' | 'cancelled';

// Where a print order is for the client: in production, on its way, delivered (or cancelled).
export function orderStage(order: Pick<CustomerOrder, 'cancelled' | 'fulfillmentStatus' | 'shipments'>): OrderStage {
  if (order.cancelled) return 'cancelled';
  if (order.shipments.some((shipment) => shipment.status === 'DELIVERED' || shipment.status === 'PICKED_UP')) return 'delivered';
  if (order.shipments.length || order.fulfillmentStatus === 'FULFILLED' || order.fulfillmentStatus === 'PARTIALLY_FULFILLED') return 'shipped';
  return 'production';
}

// Product orders only: credit top-ups and subscription payments are not print jobs.
export const isPrintOrder = (order: CustomerOrder) => !order.creditsOnly && !order.subscriptionPlan;
