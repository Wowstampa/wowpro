import 'server-only';

import {hasActiveSubscription} from '@/lib/access';
import {escapeHtml, sendEmail} from '@/lib/email';
import {listWowproClients} from '@/lib/integrations/airtable';
import {shopifyAdminQuery} from '@/lib/integrations/shopify';
import {filterByPreference} from '@/lib/notification-prefs';
import {REQUEST_FILES_BUCKET, ensureRequestFilesBucket} from '@/lib/request-files';
import {createAdminClient} from '@/lib/supabase/admin.server';

// WowStampa promotions that WOWPRO clients can use before everyone else.
// Stored as one JSON document in storage (no database change); the discount itself lives in Shopify,
// restricted to customers tagged "WOWPRO" until the public date.

export type Promo = {
  id: string;
  title: string;
  description: string;
  discountType: 'percentage' | 'amount';
  value: number;
  scope: 'all' | 'collection';
  collectionId: string | null;
  collectionTitle: string | null;
  code: string;
  link: string;
  earlyStartsAt: string;
  publicStartsAt: string | null; // null = stays reserved to WOWPRO until the end
  endsAt: string | null;
  image: {path: string; version: number} | null;
  shopify: {mode: 'auto' | 'manual'; discountId: string | null; openedToAll: boolean; error: string | null};
  notifiedAt: string | null;
  watchers: string[];
  createdAt: string;
  updatedAt: string;
};
export type PromoStage = 'upcoming' | 'early' | 'public' | 'ended';
type Store = {promos: Promo[]; segmentId: string | null; tagged: Record<string, string[]>};

const STORE_PATH = 'system/promos.json';
export const PROMO_TAG = 'WOWPRO';
export const SHOP_URL = (process.env.WOWSTAMPA_SHOP_URL || 'https://wowstampa.com').replace(/\/$/, '');

export async function readStore(): Promise<Store> {
  const {data} = await createAdminClient().storage.from(REQUEST_FILES_BUCKET).download(STORE_PATH);
  const empty: Store = {promos: [], segmentId: null, tagged: {}};
  if (!data) return empty;
  try { return {...empty, ...(JSON.parse(await data.text()) as Partial<Store>)}; } catch { return empty; }
}
export async function writeStore(store: Store) {
  await ensureRequestFilesBucket();
  const {error} = await createAdminClient().storage.from(REQUEST_FILES_BUCKET).upload(STORE_PATH, new Blob([JSON.stringify(store)], {type: 'application/json'}), {upsert: true, contentType: 'application/json'});
  if (error) throw error;
}

export function promoStage(promo: Promo, now = Date.now()): PromoStage {
  const early = Date.parse(promo.earlyStartsAt);
  const publicAt = promo.publicStartsAt ? Date.parse(promo.publicStartsAt) : null;
  const ends = promo.endsAt ? Date.parse(promo.endsAt) : null;
  if (ends && now >= ends) return 'ended';
  if (now < early) return 'upcoming';
  if (publicAt && now >= publicAt) return 'public';
  return 'early';
}

export const discountLabel = (promo: Pick<Promo, 'discountType' | 'value'>) => promo.discountType === 'percentage' ? `-${promo.value}%` : `-${new Intl.NumberFormat('it-IT', {style: 'currency', currency: 'EUR', maximumFractionDigits: 2}).format(promo.value)}`;

/* ---------- Shopify ---------- */

type UserErrors = Array<{field?: string[] | null; message: string}>;
const check = (errors: UserErrors | undefined) => { if (errors?.length) throw new Error(errors.map((error) => error.message).join(' · ')); };

// Customer segment "tagged WOWPRO", created once.
async function ensureSegment(store: Store) {
  if (store.segmentId) return store.segmentId;
  const data = await shopifyAdminQuery<{segmentCreate: {segment: {id: string} | null; userErrors: UserErrors}}>(
    `mutation PromoSegment($name: String!, $query: String!) { segmentCreate(name: $name, query: $query) { segment { id } userErrors { field message } } }`,
    {name: 'Clienti WOWPRO (portale)', query: `customer_tags CONTAINS '${PROMO_TAG}'`},
  );
  check(data.segmentCreate.userErrors);
  store.segmentId = data.segmentCreate.segment?.id || null;
  if (!store.segmentId) throw new Error('Segmento clienti WOWPRO non creato.');
  return store.segmentId;
}

function discountInput(promo: Promo, segmentId: string, openToAll: boolean) {
  return {
    title: `${promo.title} (${openToAll ? 'tutti' : 'anteprima WOWPRO'})`,
    code: promo.code,
    startsAt: promo.earlyStartsAt,
    endsAt: promo.endsAt,
    context: openToAll ? {all: 'ALL'} : {customerSegments: {add: [segmentId]}},
    customerGets: {
      value: promo.discountType === 'percentage' ? {percentage: Math.min(promo.value, 100) / 100} : {discountAmount: {amount: promo.value, appliesOnEachItem: false}},
      items: promo.scope === 'collection' && promo.collectionId ? {collections: {add: [promo.collectionId]}} : {all: true},
    },
    combinesWith: {orderDiscounts: false, productDiscounts: false, shippingDiscounts: true},
  };
}

export async function saveShopifyDiscount(promo: Promo, store: Store) {
  if (promo.shopify.mode !== 'auto') return;
  const segmentId = await ensureSegment(store);
  const openToAll = promoStage(promo) === 'public';
  const input = discountInput(promo, segmentId, openToAll);
  if (promo.shopify.discountId) {
    const data = await shopifyAdminQuery<{discountCodeBasicUpdate: {userErrors: UserErrors}}>(
      `mutation PromoUpdate($id: ID!, $input: DiscountCodeBasicInput!) { discountCodeBasicUpdate(id: $id, basicCodeDiscount: $input) { userErrors { field message } } }`,
      {id: promo.shopify.discountId, input},
    );
    check(data.discountCodeBasicUpdate.userErrors);
  } else {
    const data = await shopifyAdminQuery<{discountCodeBasicCreate: {codeDiscountNode: {id: string} | null; userErrors: UserErrors}}>(
      `mutation PromoCreate($input: DiscountCodeBasicInput!) { discountCodeBasicCreate(basicCodeDiscount: $input) { codeDiscountNode { id } userErrors { field message } } }`,
      {input},
    );
    check(data.discountCodeBasicCreate.userErrors);
    promo.shopify.discountId = data.discountCodeBasicCreate.codeDiscountNode?.id || null;
  }
  promo.shopify.openedToAll = openToAll;
  promo.shopify.error = null;
}

export async function deleteShopifyDiscount(promo: Promo) {
  if (promo.shopify.mode !== 'auto' || !promo.shopify.discountId) return;
  const data = await shopifyAdminQuery<{discountCodeDelete: {userErrors: UserErrors}}>(
    `mutation PromoDelete($id: ID!) { discountCodeDelete(id: $id) { userErrors { field message } } }`,
    {id: promo.shopify.discountId},
  );
  check(data.discountCodeDelete.userErrors);
}

export async function listShopifyCollections() {
  const data = await shopifyAdminQuery<{collections: {nodes: Array<{id: string; title: string}>}}>(`query PromoCollections { collections(first: 100, sortKey: TITLE) { nodes { id title } } }`);
  return data.collections.nodes;
}

export async function countPromoOrders(code: string) {
  const data = await shopifyAdminQuery<{orders: {nodes: Array<{id: string}>}}>(`query PromoOrders($q: String!) { orders(first: 250, query: $q) { nodes { id } } }`, {q: `discount_code:${code}`});
  return data.orders.nodes.length;
}

/* ---------- Customer tags ---------- */

async function customerGids(customerId: string | undefined, email: string | undefined) {
  const ids = new Set<string>();
  const numeric = (customerId || '').replace(/\D/g, '');
  if (numeric) ids.add(`gid://shopify/Customer/${numeric}`);
  const clean = (email || '').trim().toLowerCase().replace(/["\\]/g, '');
  if (clean) {
    const data = await shopifyAdminQuery<{customers: {nodes: Array<{id: string}>}}>(`query PromoCustomer($q: String!) { customers(first: 5, query: $q) { nodes { id } } }`, {q: `email:"${clean}"`});
    for (const node of data.customers.nodes) ids.add(node.id);
  }
  return [...ids];
}

async function setTag(gid: string, add: boolean) {
  const mutation = add ? 'tagsAdd' : 'tagsRemove';
  const data = await shopifyAdminQuery<Record<string, {userErrors: UserErrors}>>(`mutation PromoTag($id: ID!, $tags: [String!]!) { ${mutation}(id: $id, tags: $tags) { userErrors { field message } } }`, {id: gid, tags: [PROMO_TAG]});
  check(data[mutation].userErrors);
}

// Shopify customers of active WOWPRO clients carry the "WOWPRO" tag; it is removed when the subscription ends.
async function syncCustomerTags(store: Store) {
  const admin = createAdminClient();
  const [clients, {data: companies}] = await Promise.all([listWowproClients(), admin.from('companies').select('id,airtable_record_id')]);
  const companyOf = new Map((companies || []).map((row) => [row.airtable_record_id as string, row.id as string]));
  const report = {added: 0, removed: 0, errors: 0};
  const wanted = new Set<string>();
  for (const client of clients) {
    if (client.fields.archiviato) continue;
    const companyId = companyOf.get(client.id);
    if (!companyId || !(await hasActiveSubscription(companyId))) continue;
    wanted.add(client.id);
    if (store.tagged[client.id]?.length) continue;
    try {
      const gids = await customerGids(client.fields.shopify_customer_id, client.fields.email_login);
      for (const gid of gids) await setTag(gid, true);
      store.tagged[client.id] = gids;
      if (gids.length) report.added += 1;
    } catch (error) { report.errors += 1; console.error('[Promo tag add]', client.id, error); }
  }
  for (const [recordId, gids] of Object.entries(store.tagged)) {
    if (wanted.has(recordId)) continue;
    try { for (const gid of gids) await setTag(gid, false); delete store.tagged[recordId]; report.removed += 1; }
    catch (error) { report.errors += 1; console.error('[Promo tag remove]', recordId, error); }
  }
  return report;
}

/* ---------- Launch email ---------- */

async function notifyLaunch(promo: Promo) {
  const admin = createAdminClient();
  const {data: people} = await admin.from('profiles').select('id,email,company_id').eq('role', 'client').eq('status', 'active');
  const eligible: Array<{id: string; email: string}> = [];
  for (const person of people || []) if (person.company_id && await hasActiveSubscription(person.company_id)) eligible.push({id: person.id, email: person.email});
  // "Avvisami" overrides the general preference.
  const allowed = new Set((await filterByPreference(eligible, 'promo')).map((person) => person.id));
  const origin = (process.env.NEXT_PUBLIC_APP_URL || 'https://wowpro.it').replace(/\/$/, '');
  const link = `${origin}/dashboard/promo`;
  const until = promo.publicStartsAt ? `Solo per i clienti WOWPRO fino al ${new Intl.DateTimeFormat('it-IT', {day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome'}).format(new Date(promo.publicStartsAt))}, poi aperta a tutti.` : 'Riservata ai clienti WOWPRO.';
  const subject = `In anteprima per te: ${promo.title} (${discountLabel(promo)})`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#0a0d15"><p style="font-size:12px;letter-spacing:.08em;color:#11823f;font-weight:bold">WOWPRO · PROMO IN ANTEPRIMA</p><h2 style="margin:0 0 10px">${escapeHtml(promo.title)} <span style="color:#11823f">${escapeHtml(discountLabel(promo))}</span></h2><p style="color:#3a4556;line-height:1.5">${escapeHtml(promo.description)}</p><p style="color:#3a4556">${escapeHtml(until)}</p><p style="margin:18px 0;font-size:18px;font-weight:bold;letter-spacing:.08em;padding:12px 16px;border:2px dashed #1db65b;display:inline-block;border-radius:10px">${escapeHtml(promo.code)}</p><br><a href="${link}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#1db65b;color:#fff;text-decoration:none;font-weight:bold">Vedi la promo</a></div>`;
  let sent = 0;
  for (const person of eligible) {
    if (!allowed.has(person.id) && !promo.watchers.includes(person.id)) continue;
    try { await sendEmail({to: person.email, subject, html, text: `${subject}\n\n${promo.description}\n${until}\nCodice: ${promo.code}\n\n${link}`}); sent += 1; } catch (error) { console.error('[Promo email]', error); }
  }
  return sent;
}

/* ---------- Scheduled job (every 15 minutes) ---------- */

export async function runPromoJobs() {
  const store = await readStore();
  const report: Record<string, unknown> = {};
  try { report.tags = await syncCustomerTags(store); } catch (error) { report.tags = {error: error instanceof Error ? error.message : 'errore'}; }
  let emails = 0; let opened = 0;
  for (const promo of store.promos) {
    const stage = promoStage(promo);
    // Public date reached: the Shopify code opens to every customer.
    if (stage === 'public' && promo.shopify.mode === 'auto' && promo.shopify.discountId && !promo.shopify.openedToAll) {
      try { await saveShopifyDiscount(promo, store); opened += 1; } catch (error) { promo.shopify.error = error instanceof Error ? error.message : 'Errore Shopify'; }
    }
    // Launch email when the early window opens (a promo created already public is not announced as a preview).
    if ((stage === 'early' || stage === 'public') && !promo.notifiedAt) {
      promo.notifiedAt = new Date().toISOString();
      if (stage === 'early') emails += await notifyLaunch(promo);
    }
  }
  await writeStore(store);
  return {...report, opened, emails};
}
