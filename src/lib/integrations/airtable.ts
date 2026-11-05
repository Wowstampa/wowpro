import 'server-only';

import {revalidateTag, unstable_cache} from 'next/cache';

export type AirtableRecord<T> = {id: string; fields: T};

export type AirtableWowproClient = {
  cliente_id?: string;
  ragione_sociale?: string;
  email_login?: string;
  piano?: string;
  crediti_inclusi_mese?: number;
  crediti_inclusi_residui?: number;
  crediti_extra_residui?: number;
  data_rinnovo_piano?: string;
  shopify_customer_id?: string;
  stato_abbonamento?: string;
  account_manager_nome?: string;
  grafico_dedicato_nome?: string;
  archiviato?: boolean;
};

type AirtableResponse = {
  records: AirtableRecord<AirtableWowproClient>[];
  offset?: string;
};

function getAirtableConfig() {
  const token = process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const table = process.env.AIRTABLE_CLIENTS_TABLE || 'Clienti';
  if (!token || !baseId) throw new Error('Configurazione Airtable incompleta.');
  return {token, baseId, table};
}

export async function listWowproClients() {
  return await cachedWowproClients();
}

async function readWowproClients() {
  const {token, baseId, table} = getAirtableConfig();
  const records: AirtableRecord<AirtableWowproClient>[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);

    const response = await fetch(url, {headers: {Authorization: `Bearer ${token}`}, cache: 'no-store', signal: AbortSignal.timeout(10_000)});
    if (!response.ok) throw new Error(`Airtable ha risposto con stato ${response.status}.`);

    const payload = await response.json() as AirtableResponse;
    records.push(...payload.records);
    offset = payload.offset;
  } while (offset);

  return records;
}

export async function getWowproClient(recordId: string, options?: {fresh?: boolean}) {
  // Balances shown immediately after a credit mutation must never use stale data.
  return options?.fresh ? await readWowproClient(recordId) : await cachedWowproClient(recordId);
}

async function readWowproClient(recordId: string) {
  const {token, baseId, table} = getAirtableConfig();
  const response = await fetch(
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}/${recordId}`,
    {headers: {Authorization: `Bearer ${token}`}, cache: 'no-store', signal: AbortSignal.timeout(10_000)},
  );
  if (!response.ok) throw new Error(`Airtable ha risposto con stato ${response.status}.`);
  return await response.json() as AirtableRecord<AirtableWowproClient>;
}

export async function updateWowproClient(recordId: string, fields: Partial<AirtableWowproClient>) {
  const {token, baseId, table} = getAirtableConfig();
  const response = await fetch(
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}/${recordId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({fields}),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw new Error(`Airtable ha risposto con stato ${response.status}.`);
  const record = await response.json() as AirtableRecord<AirtableWowproClient>;
  // Credit and client updates must be reflected immediately after a successful write.
  revalidateTag('airtable-wowpro-clients', 'max');
  return record;
}

export async function createWowproClient(fields: Partial<AirtableWowproClient>) {
  const {token, baseId, table} = getAirtableConfig();
  const send = (payload: Partial<AirtableWowproClient>) => fetch(
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({fields: payload, typecast: true}),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    },
  );

  let response = await send(fields);
  // If cliente_id is a computed field in Airtable (formula/autonumber) it cannot be written:
  // retry without it and let Airtable assign the identifier.
  if (response.status === 422 && fields.cliente_id) {
    const {cliente_id: _ignored, ...rest} = fields;
    void _ignored;
    response = await send(rest);
  }
  if (!response.ok) throw new Error(`Airtable ha risposto con stato ${response.status}.`);
  const record = await response.json() as AirtableRecord<AirtableWowproClient>;
  revalidateTag('airtable-wowpro-clients', 'max');
  return record;
}

export async function nextWowproClientId() {
  const records = await readWowproClients();
  const highest = records.reduce((max, {fields}) => {
    const match = /^CL(\d+)$/i.exec(fields.cliente_id?.trim() || '');
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `CL${String(highest + 1).padStart(3, '0')}`;
}

export async function listAuthorizedWowproClients() {
  const records = await listWowproClients();
  return records.filter(({fields}) => fields.stato_abbonamento?.toLowerCase() === 'attivo');
}

// Airtable is the slowest dependency in the navigation path. A short shared cache
// keeps page changes responsive while mutations above explicitly invalidate it.
const cachedWowproClients = unstable_cache(readWowproClients, ['airtable-wowpro-clients-list'], {revalidate: 60, tags: ['airtable-wowpro-clients']});
const cachedWowproClient = unstable_cache(readWowproClient, ['airtable-wowpro-client'], {revalidate: 60, tags: ['airtable-wowpro-clients']});
