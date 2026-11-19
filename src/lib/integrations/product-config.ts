import 'server-only';

// Reads how a product is configured on wowstampa.com, so the quote picker offers the same choices as the shop:
// Shopify options/variants, Best Custom Product Options fields (bcpo_data) and the custom m² calculator (sizes).

export type ConfigValue = {label: string; image: string | null; surcharge: number | null};
export type ConfigField =
  | {id: string; kind: 'choice' | 'swatch'; title: string; required: boolean; preselect: string; values: ConfigValue[]; showIf: {field: string; value: string} | null}
  | {id: string; kind: 'text'; title: string; required: boolean; preselect: string; values: []; showIf: {field: string; value: string} | null}
  | {id: string; kind: 'heading'; title: string; showIf: null}
  | {id: string; kind: 'sizes'; title: string; sizes: Array<{code: string; name: string}>; showIf: {field: string; value: string} | null};
export type ProductConfigurator = {
  handle: string; title: string; url: string; imageUrl: string | null; images: string[];
  options: Array<{name: string; values: string[]}>;
  variants: Array<{id: string; title: string; price: number; options: string[]; imageUrl: string | null; available: boolean}>;
  fields: ConfigField[];
  dimensions: {minWidth: number; minHeight: number; maxWidth: number; maxHeight: number; defaultWidth: number; defaultHeight: number; minAreaM2: number; formats: Array<{label: string; base: number; height: number}>} | null;
};

const CACHE = new Map<string, {at: number; value: ProductConfigurator}>();
const TTL = 10 * 60 * 1000;

function storefront() {
  return (process.env.SHOPIFY_STOREFRONT_URL || 'https://wowstampa.com').replace(/\/$/, '');
}

const decode = (value: string) => value.replace(/&quot;/g, '"').replace(/&#39;|&#039;/g, '\'').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const strip = (value: string) => decode(value.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const num = (value: unknown, fallback = 0) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; };

// Extracts the JSON object assigned to `var <name>=` in the page, honouring strings so braces inside values are ignored.
function extractObject(html: string, name: string) {
  const start = html.search(new RegExp(`var\\s+${name}\\s*=\\s*\\{`));
  if (start < 0) return null;
  const open = html.indexOf('{', start);
  let depth = 0; let inString = false; let escaped = false;
  for (let index = open; index < html.length; index += 1) {
    const char = html[index];
    if (inString) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') inString = false; continue; }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') { depth -= 1; if (depth === 0) { try { return JSON.parse(html.slice(open, index + 1)); } catch { return null; } } }
  }
  return null;
}

function attribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`));
  return match ? decode(match[1]) : null;
}

type BcpoOption = {title?: string; type?: string; unique?: string; preselect_value?: string; conditional_option?: string; conditional_value?: string; required?: string; values?: Array<{key?: string; price?: string; value?: string}>};

function parseFields(html: string): ConfigField[] {
  const data = extractObject(html, 'bcpo_data') as {virtual_options?: BcpoOption[]} | null;
  const fields: ConfigField[] = [];
  for (const [index, option] of (data?.virtual_options || []).entries()) {
    const id = option.unique || `field-${index}`;
    const title = (option.title || '').trim();
    const condition = option.conditional_option ? {field: String(option.conditional_option), value: String(option.conditional_value || '')} : null;
    if (option.type === 'instructions') {
      const raw = option.values?.[0]?.key || '';
      const sizes = [...raw.matchAll(/ws-sizes__badge[^>]*>([^<]+)<\/span>\s*<span[^>]*ws-sizes__name[^>]*>([^<]+)</g)].map((match) => ({code: strip(match[1]), name: strip(match[2])}));
      if (sizes.length) { fields.push({id, kind: 'sizes', title: title || strip(raw.split('ws-sizes')[0]).replace(/:$/, '') || 'Taglie', sizes, showIf: condition}); continue; }
      const text = strip(raw);
      if (text && text.length <= 60) fields.push({id, kind: 'heading', title: text, showIf: null});
      continue;
    }
    const values = (option.values || []).filter((value) => value.key).map((value) => ({label: String(value.key).trim(), image: option.type === 'images' && value.value && /^https?:/.test(value.value) ? value.value : null, surcharge: value.price ? num(value.price, 0) || null : null}));
    const base = {id, title, required: option.required === 'on', preselect: option.preselect_value || '', showIf: condition};
    if (['buttons', 'default', 'dropdown', 'radio', 'images', 'swatch', 'color', 'checkbox'].includes(option.type || '') && values.length) {
      fields.push({...base, kind: option.type === 'images' && values.some((value) => value.image) ? 'swatch' : 'choice', values});
    } else if (title) {
      fields.push({...base, kind: 'text', values: []});
    }
  }
  return fields;
}

function parseDimensions(html: string): ProductConfigurator['dimensions'] {
  const tag = html.match(/<[a-z]+\s[^>]*data-ws-sqm-pricing[^>]*data-product-config="[^"]*"[^>]*>/i)?.[0];
  if (!tag) return null;
  let config: {enableSqmCalculator?: boolean} = {};
  try { config = JSON.parse(attribute(tag, 'data-product-config') || '{}'); } catch { /* Missing config: calculator off. */ }
  if (!config.enableSqmCalculator) return null;
  let formats: Array<{label: string; base: number; height: number}> = [];
  try {
    const promo = JSON.parse(attribute(tag, 'data-promo-config') || '{}') as {enablePromoFormats?: boolean; formats?: Array<{label?: string; base?: number; height?: number}>};
    if (promo.enablePromoFormats) formats = (promo.formats || []).filter((format) => format.base && format.height).map((format) => ({label: `${format.base} × ${format.height} cm`, base: num(format.base), height: num(format.height)}));
  } catch { /* No preset formats. */ }
  return {
    minWidth: num(attribute(tag, 'data-min-width'), 1), minHeight: num(attribute(tag, 'data-min-height'), 1),
    maxWidth: num(attribute(tag, 'data-max-width')), maxHeight: num(attribute(tag, 'data-max-height')),
    defaultWidth: num(attribute(tag, 'data-default-width'), 100), defaultHeight: num(attribute(tag, 'data-default-height'), 100),
    minAreaM2: num(attribute(tag, 'data-minimum-area-m2')), formats,
  };
}

type ProductJs = {title: string; handle: string; images?: string[]; featured_image?: string | null; options: Array<{name: string; values: string[]} | string>; variants: Array<{id: number; title: string; price: number; options: string[]; available: boolean; featured_image?: {src: string} | null}>};

const absolute = (url: string | null | undefined) => (url ? (url.startsWith('//') ? `https:${url}` : url) : null);

export async function getProductConfigurator(handle: string): Promise<ProductConfigurator> {
  const cached = CACHE.get(handle);
  if (cached && Date.now() - cached.at < TTL) return cached.value;
  const base = `${storefront()}/products/${encodeURIComponent(handle)}`;
  const [jsResponse, htmlResponse] = await Promise.all([
    fetch(`${base}.js`, {headers: {Accept: 'application/json'}, cache: 'no-store'}),
    fetch(base, {headers: {Accept: 'text/html'}, cache: 'no-store'}),
  ]);
  if (!jsResponse.ok) throw new Error(`Prodotto non trovato (${jsResponse.status}).`);
  const product = await jsResponse.json() as ProductJs;
  const html = htmlResponse.ok ? await htmlResponse.text() : '';
  const options = product.options.map((option) => (typeof option === 'string' ? {name: option, values: []} : option)).filter((option) => !(option.name === 'Title' && option.values.length <= 1 && option.values[0] === 'Default Title'));
  const images = (product.images || []).map((image) => absolute(image)!).filter(Boolean).slice(0, 8);
  const value: ProductConfigurator = {
    handle: product.handle, title: product.title, url: base, imageUrl: absolute(product.featured_image) || images[0] || null, images,
    options,
    variants: product.variants.map((variant) => ({id: `gid://shopify/ProductVariant/${variant.id}`, title: variant.title === 'Default Title' ? '' : variant.title, price: variant.price / 100, options: variant.options, imageUrl: absolute(variant.featured_image?.src), available: variant.available})),
    fields: html ? parseFields(html) : [],
    dimensions: html ? parseDimensions(html) : null,
  };
  CACHE.set(handle, {at: Date.now(), value});
  return value;
}
