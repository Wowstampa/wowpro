import 'server-only';

import {createHmac, timingSafeEqual} from 'node:crypto';

type ShopifyGraphqlResponse<T> = {data?: T; errors?: Array<{message: string}>};

const DEFAULT_STORE_DOMAIN = 'wowstampa.myshopify.com';
const DEFAULT_CREDITS_PRODUCT_ID = '16147057410379';

function getStoreDomain() {
  return process.env.SHOPIFY_STORE_DOMAIN || DEFAULT_STORE_DOMAIN;
}

// Dev Dashboard apps receive short-lived tokens through the client credentials grant.
// The token is cached in memory and refreshed a few minutes before it expires.
let cachedToken: {value: string; expiresAt: number} | null = null;

async function getAccessToken() {
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (clientId && clientSecret) {
    if (cachedToken && cachedToken.expiresAt > Date.now() + 5 * 60_000) return cachedToken.value;
    const response = await fetch(`https://${getStoreDomain()}/admin/oauth/access_token`, {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret}),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Token Shopify non ottenuto (stato ${response.status}).`);
    const payload = await response.json() as {access_token: string; expires_in?: number};
    cachedToken = {value: payload.access_token, expiresAt: Date.now() + (payload.expires_in || 86_399) * 1000};
    return cachedToken.value;
  }
  const legacyToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (legacyToken) return legacyToken;
  throw new Error('Configurazione Shopify incompleta.');
}

export async function shopifyAdminQuery<T>(query: string, variables: Record<string, unknown> = {}) {
  const version = process.env.SHOPIFY_API_VERSION || '2026-07';
  const token = await getAccessToken();

  const response = await fetch(`https://${getStoreDomain()}/admin/api/${version}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({query, variables}),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json() as ShopifyGraphqlResponse<T>;
  if (!response.ok || payload.errors?.length) {
    throw new Error(payload.errors?.[0]?.message || `Shopify ha risposto con stato ${response.status}.`);
  }
  if (!payload.data) throw new Error('Shopify non ha restituito dati.');
  return payload.data;
}

/* ---------- Extra credit packages ---------- */

export type CreditPackage = {variantId: string; credits: number; price: number; currency: string; title: string};

export function getCreditsProductId() {
  return (process.env.SHOPIFY_CREDITS_PRODUCT_ID || DEFAULT_CREDITS_PRODUCT_ID).replace(/\D/g, '');
}

export function creditsFromTitle(title: string | null | undefined) {
  const match = /(\d[\d.\s]*)/.exec(title || '');
  return match ? Number(match[1].replace(/[.\s]/g, '')) : 0;
}

let cachedPackages: {value: CreditPackage[]; expiresAt: number} | null = null;

export async function listCreditPackages() {
  if (cachedPackages && cachedPackages.expiresAt > Date.now()) return cachedPackages.value;
  const data = await shopifyAdminQuery<{product: {variants: {nodes: Array<{id: string; title: string; price: string; availableForSale: boolean}>}} | null; shop: {currencyCode: string}}>(
    `query CreditPackages($id: ID!) {
      shop { currencyCode }
      product(id: $id) { variants(first: 50) { nodes { id title price availableForSale } } }
    }`,
    {id: `gid://shopify/Product/${getCreditsProductId()}`},
  );
  const packages = (data.product?.variants.nodes || [])
    .map((variant) => ({variantId: variant.id.split('/').pop() || '', credits: creditsFromTitle(variant.title), price: Number(variant.price), currency: data.shop.currencyCode, title: variant.title}))
    .filter((item) => item.variantId && item.credits > 0)
    .sort((a, b) => a.credits - b.credits);
  cachedPackages = {value: packages, expiresAt: Date.now() + 5 * 60_000};
  return packages;
}

export function buildCreditsCheckoutUrl({variantId, email, clientRecordId}: {variantId: string; email: string; clientRecordId: string}) {
  const storefront = process.env.SHOPIFY_STOREFRONT_URL || `https://${getStoreDomain()}`;
  const url = new URL(`/cart/${variantId}:1`, storefront);
  if (email) url.searchParams.set('checkout[email]', email);
  url.searchParams.set('attributes[wowpro_client]', clientRecordId);
  return url.toString();
}

/* ---------- Webhooks ---------- */

export function verifyShopifyWebhook(rawBody: string, hmacHeader: string | null) {
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret || !hmacHeader) return false;
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest();
  const received = Buffer.from(hmacHeader, 'base64');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

let webhookEnsured = false;

// Registers the orders/paid webhook once per server process; safe to call repeatedly.
export async function ensureOrdersPaidWebhook(appOrigin: string) {
  if (webhookEnsured) return;
  const uri = `${appOrigin}/api/shopify/webhooks/orders-paid`;
  const existing = await shopifyAdminQuery<{webhookSubscriptions: {nodes: Array<{id: string; uri: string}>}}>(
    `query { webhookSubscriptions(first: 50, topics: [ORDERS_PAID]) { nodes { id uri } } }`,
  );
  if (!existing.webhookSubscriptions.nodes.some((subscription) => subscription.uri === uri)) {
    const created = await shopifyAdminQuery<{webhookSubscriptionCreate: {userErrors: Array<{message: string}>}}>(
      `mutation CreateWebhook($uri: String!) {
        webhookSubscriptionCreate(topic: ORDERS_PAID, webhookSubscription: {uri: $uri, format: JSON}) { userErrors { message } }
      }`,
      {uri},
    );
    const error = created.webhookSubscriptionCreate.userErrors[0];
    if (error) throw new Error(`Webhook Shopify non creato: ${error.message}`);
  }
  webhookEnsured = true;
}

/* ---------- Customer orders ---------- */

export type CustomerOrder = {
  id: string;
  name: string;
  createdAt: string;
  cancelled: boolean;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  total: number;
  currency: string;
  statusPageUrl: string | null;
  items: Array<{title: string; variantTitle: string | null; quantity: number; imageUrl: string | null}>;
  creditsOnly: boolean;
  subscriptionPlan: string | null;
  shipments: Array<{status: string | null; company: string | null; number: string | null; url: string | null}>;
};

type OrdersQuery = {orders: {nodes: Array<{
  id: string; name: string; createdAt: string; cancelledAt: string | null;
  displayFinancialStatus: string | null; displayFulfillmentStatus: string | null; statusPageUrl: string | null;
  totalPriceSet: {shopMoney: {amount: string; currencyCode: string}};
  lineItems: {nodes: Array<{title: string; variantTitle: string | null; quantity: number; image: {url: string} | null; product: {id: string} | null; sellingPlan: {name: string} | null}>};
  fulfillments: Array<{displayStatus: string | null; trackingInfo: Array<{company: string | null; number: string | null; url: string | null}>}>;
}>}};

// Shopify customer IDs for a client: the ID saved in the CRM plus any customer with the login email.
async function resolveCustomerIds({customerId, email}: {customerId?: string | null; email?: string | null}) {
  const cleanEmail = (email || '').trim().toLowerCase().replace(/["\\]/g, '');
  const customerIds = new Set<string>();
  const numericId = (customerId || '').replace(/\D/g, '');
  if (numericId) customerIds.add(numericId);
  if (cleanEmail) {
    // The Shopify customer is looked up by email too, so a missing or outdated ID in the CRM does not hide orders.
    const customers = await shopifyAdminQuery<{customers: {nodes: Array<{id: string}>}}>(
      `query CustomerByEmail($search: String!) { customers(first: 5, query: $search) { nodes { id } } }`,
      {search: `email:"${cleanEmail}"`},
    );
    for (const customer of customers.customers.nodes) customerIds.add(customer.id.split('/').pop() || '');
  }
  return {cleanEmail, customerIds: [...customerIds].filter(Boolean)};
}

// Only orders belonging to this customer are ever requested: by Shopify customer ID when known, otherwise by email.
export async function listCustomerOrders({customerId, email}: {customerId?: string | null; email?: string | null}) {
  const {cleanEmail, customerIds} = await resolveCustomerIds({customerId, email});
  const filters = customerIds.map((id) => `customer_id:${id}`);
  if (cleanEmail) filters.push(`email:"${cleanEmail}"`);
  if (!filters.length) return [];
  const search = filters.join(' OR ');
  const data = await shopifyAdminQuery<OrdersQuery>(
    `query CustomerOrders($search: String!) {
      orders(first: 50, sortKey: CREATED_AT, reverse: true, query: $search) {
        nodes {
          id name createdAt cancelledAt displayFinancialStatus displayFulfillmentStatus statusPageUrl
          totalPriceSet { shopMoney { amount currencyCode } }
          lineItems(first: 30) { nodes { title variantTitle quantity product { id } sellingPlan { name } image { url(transform: {maxWidth: 120, maxHeight: 120}) } } }
          fulfillments(first: 10) { displayStatus trackingInfo(first: 5) { company number url } }
        }
      }
    }`,
    {search},
  );
  const creditsProduct = `gid://shopify/Product/${getCreditsProductId()}`;
  return data.orders.nodes.map((order): CustomerOrder => ({
    id: order.id,
    name: order.name,
    createdAt: order.createdAt,
    cancelled: Boolean(order.cancelledAt),
    financialStatus: order.displayFinancialStatus,
    fulfillmentStatus: order.displayFulfillmentStatus,
    total: Number(order.totalPriceSet.shopMoney.amount),
    currency: order.totalPriceSet.shopMoney.currencyCode,
    statusPageUrl: order.statusPageUrl,
    items: order.lineItems.nodes.map((item) => ({title: item.title, variantTitle: item.variantTitle, quantity: item.quantity, imageUrl: item.image?.url || null})),
    creditsOnly: order.lineItems.nodes.length > 0 && order.lineItems.nodes.every((item) => item.product?.id === creditsProduct),
    subscriptionPlan: order.lineItems.nodes.find((item) => item.sellingPlan)?.sellingPlan?.name || null,
    shipments: order.fulfillments.flatMap((fulfillment) => fulfillment.trackingInfo.length
      ? fulfillment.trackingInfo.map((tracking) => ({status: fulfillment.displayStatus, ...tracking}))
      : [{status: fulfillment.displayStatus, company: null, number: null, url: null}]),
  }));
}

export type SubscriptionStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'EXPIRED' | 'FAILED';
export type CustomerSubscription = {
  status: SubscriptionStatus | null;
  nextBillingDate: string | null;
  plan: string | null;
  price: string | null;
  billing: {name: string | null; company: string | null; lines: string[]; extra: Array<{label: string; value: string}>} | null;
};

type MetafieldNode = {key: string; value: string};
type AddressNode = {name: string | null; company: string | null; address1: string | null; address2: string | null; zip: string | null; city: string | null; province: string | null; countryCodeV2: string | null} | null;

// Subscription status written on the Shopify customer by Shopify Flow (namespace "wowpro"), because a contract
// created by the Shopify Subscriptions app can only be read by that app.
export async function getCustomerSubscription({customerId, email}: {customerId?: string | null; email?: string | null}): Promise<CustomerSubscription> {
  const {customerIds} = await resolveCustomerIds({customerId, email});
  if (!customerIds.length) return {status: null, nextBillingDate: null, plan: null, price: null, billing: null};
  const data = await shopifyAdminQuery<{nodes: Array<{id: string; metafields: {nodes: MetafieldNode[]}} | null>}>(
    `query CustomerSubscription($ids: [ID!]!) { nodes(ids: $ids) { ... on Customer { id metafields(first: 20, namespace: "wowpro") { nodes { key value } } } } }`,
    {ids: customerIds.map((id) => `gid://shopify/Customer/${id}`)},
  );
  // With more than one customer record, the one with a subscription status wins (an active one first).
  const candidates = data.nodes.filter(Boolean).map((node) => Object.fromEntries(node!.metafields.nodes.map((field) => [field.key, field.value.trim()])) as Record<string, string>);
  const fields = candidates.find((entry) => entry.subscription_status?.toUpperCase() === 'ACTIVE') || candidates.find((entry) => entry.subscription_status) || {};
  const status = (fields.subscription_status || '').toUpperCase();
  return {
    status: ['ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED', 'FAILED'].includes(status) ? status as SubscriptionStatus : null,
    nextBillingDate: fields.subscription_next_billing || null,
    plan: fields.subscription_plan || null,
    price: fields.subscription_price || null,
    billing: null,
  };
}

const BILLING_ATTRIBUTE = /iva|vat|fiscal|sdi|pec|destinatario|tax/i;

// Billing details on the client's latest order, used by the accounting team for the SDI invoice.
// Address fields are protected customer data: if the app has no access, the page simply hides them.
export async function getLatestBillingDetails(orderId: string): Promise<CustomerSubscription['billing']> {
  const data = await shopifyAdminQuery<{order: {billingAddress: AddressNode; customAttributes: Array<{key: string; value: string | null}>} | null}>(
    `query OrderBilling($id: ID!) { order(id: $id) { billingAddress { name company address1 address2 zip city province countryCodeV2 } customAttributes { key value } } }`,
    {id: orderId},
  );
  const address = data.order?.billingAddress;
  const extra = (data.order?.customAttributes || []).filter((attribute) => attribute.value && BILLING_ATTRIBUTE.test(attribute.key)).map((attribute) => ({label: attribute.key, value: attribute.value as string}));
  if (!address && !extra.length) return null;
  const cityLine = [address?.zip, address?.city, address?.province ? `(${address.province})` : null].filter(Boolean).join(' ');
  return {
    name: address?.name || null,
    company: address?.company || null,
    lines: [address?.address1, address?.address2, cityLine, address?.countryCodeV2 && address.countryCodeV2 !== 'IT' ? address.countryCodeV2 : null].filter((line): line is string => Boolean(line)),
    extra,
  };
}

export function getSubscriptionCheckoutUrl() {
  return process.env.SHOPIFY_SUBSCRIPTION_URL || null;
}

export function getCustomerAccountUrl() {
  const storefront = process.env.SHOPIFY_STOREFRONT_URL || `https://${getStoreDomain()}`;
  return `${storefront.replace(/\/$/, '')}/account`;
}
