// Hands a "Riordina" draft from any page to the quote form on /dashboard/richieste (same tab, survives the navigation).
import type {CustomerOrder} from '@/lib/integrations/shopify';

export type ReorderItem = {productId: string; variantId: string; productTitle: string; variantTitle: string; imageUrl: string | null; quantity: number; note: string; listPrice: number | null; options?: Array<{name: string; value: string}>; graphicRequest?: {id: string; publicId: string; title: string} | null};
export type ReorderDraft = {items: ReorderItem[]; notes: string; source: string};

const KEY = 'wowpro:reorder';
export const REORDER_URL = '/dashboard/richieste?tab=preventivi&new=reorder';

export function saveReorder(draft: ReorderDraft) {
  try { window.sessionStorage.setItem(KEY, JSON.stringify(draft)); return true; } catch { return false; }
}

export function takeReorder(): ReorderDraft | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
    const draft = raw ? JSON.parse(raw) as ReorderDraft : null;
    return draft?.items?.length ? draft : null;
  } catch { return null; }
}

// A Shopify order becomes catalog lines when the product still exists, otherwise a described custom line.
export function draftFromOrder(order: Pick<CustomerOrder, 'name' | 'items'>): ReorderDraft {
  return {
    source: order.name,
    notes: `Riordino dell’ordine ${order.name}.`,
    items: order.items.map((item) => item.productId && item.variantId
      ? {productId: item.productId, variantId: item.variantId, productTitle: item.title, variantTitle: item.variantTitle || '', imageUrl: item.imageUrl, quantity: item.quantity, note: '', listPrice: null, options: []}
      : {productId: 'custom', variantId: '', productTitle: item.title, variantTitle: '', imageUrl: item.imageUrl, quantity: item.quantity, note: [item.variantTitle, `Come nell’ordine ${order.name}`].filter(Boolean).join(' · '), listPrice: null, options: []}),
  };
}
