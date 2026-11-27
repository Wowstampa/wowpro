import 'server-only';

import {getWowproClient} from '@/lib/integrations/airtable';
import {listCustomerOrders} from '@/lib/integrations/shopify';
import {discountLabel, promoStage, readStore, SHOP_URL, type Promo, type PromoStage} from '@/lib/promos';

export type ClientPromo = {
  id: string; title: string; description: string; discount: string; stage: PromoStage;
  code: string | null; link: string; imageUrl: string | null; scopeLabel: string | null;
  earlyStartsAt: string; publicStartsAt: string | null; endsAt: string | null;
  watching: boolean; saved: number | null;
};

const imageUrl = (promo: Promo) => promo.image ? `/api/promos/${promo.id}/image?v=${promo.image.version}` : null;

// Promos as a WOWPRO client sees them: the code only once unlocked, the savings from their own Shopify orders.
export async function getClientPromos(profileId: string, recordId: string | null, email: string): Promise<ClientPromo[]> {
  const store = await readStore();
  const now = Date.now();
  const sixMonths = now - 183 * 24 * 60 * 60 * 1000;
  const visible = store.promos.filter((promo) => promoStage(promo, now) !== 'ended' || Date.parse(promo.endsAt || promo.earlyStartsAt) > sixMonths);

  // Savings: Shopify orders of this client that used a promo code.
  const savedByCode = new Map<string, number>();
  if (visible.some((promo) => promoStage(promo, now) !== 'upcoming')) {
    try {
      const client = recordId ? await getWowproClient(recordId).catch(() => null) : null;
      const orders = await listCustomerOrders({customerId: client?.fields.shopify_customer_id || null, email: client?.fields.email_login || email});
      for (const order of orders) {
        if (order.cancelled) continue;
        for (const code of order.discountCodes) savedByCode.set(code.toUpperCase(), (savedByCode.get(code.toUpperCase()) || 0) + order.discountTotal / Math.max(order.discountCodes.length, 1));
      }
    } catch (error) { console.error('[Promo savings]', error); }
  }

  return visible.map((promo) => {
    const stage = promoStage(promo, now);
    const saved = savedByCode.get(promo.code.toUpperCase());
    return {
      id: promo.id, title: promo.title, description: promo.description, discount: discountLabel(promo), stage,
      // The code is revealed only while the promo can be used.
      code: stage === 'early' || stage === 'public' ? promo.code : null,
      link: promo.link || SHOP_URL, imageUrl: imageUrl(promo), scopeLabel: promo.scope === 'collection' ? promo.collectionTitle : null,
      earlyStartsAt: promo.earlyStartsAt, publicStartsAt: promo.publicStartsAt, endsAt: promo.endsAt,
      watching: promo.watchers.includes(profileId), saved: saved ? Math.round(saved * 100) / 100 : null,
    };
  }).sort((a, b) => a.earlyStartsAt.localeCompare(b.earlyStartsAt));
}

// Early promos right now (sidebar badge and dashboard card).
export async function getEarlyPromos() {
  try {
    const store = await readStore();
    return store.promos.filter((promo) => promoStage(promo) === 'early').map((promo) => ({id: promo.id, title: promo.title, discount: discountLabel(promo), publicStartsAt: promo.publicStartsAt, endsAt: promo.endsAt, imageUrl: imageUrl(promo)}));
  } catch { return []; }
}
