import {z} from 'zod';

import type {AirtableWowproClient} from '@/lib/integrations/airtable';
import type {BillingDetails} from '@/lib/integrations/shopify';

const upper = (value: string) => value.trim().toUpperCase().replace(/\s+/g, '');

// Italian invoicing data needed by the accounting team to issue the electronic invoice (SDI).
export const billingSchema = z.object({
  company: z.string().trim().min(2, 'Inserisci la ragione sociale.').max(160),
  vatNumber: z.string().transform((value) => upper(value).replace(/^IT/, '')).pipe(z.string().regex(/^\d{11}$/, 'La partita IVA deve avere 11 cifre.')),
  taxCode: z.string().transform(upper).pipe(z.string().regex(/^(\d{11}|[A-Z0-9]{16})?$/, 'Codice fiscale non valido.')),
  sdi: z.string().transform(upper).pipe(z.string().regex(/^([A-Z0-9]{7})?$/, 'Il codice SDI deve avere 7 caratteri.')),
  pec: z.union([z.string().trim().toLowerCase().email('PEC non valida.').max(160), z.literal('')]),
  address: z.string().trim().min(3, 'Inserisci l’indirizzo della sede.').max(200),
  zip: z.string().trim().regex(/^\d{5}$/, 'Il CAP deve avere 5 cifre.'),
  city: z.string().trim().min(2, 'Inserisci la città.').max(100),
  province: z.string().transform(upper).pipe(z.string().regex(/^[A-Z]{2}$/, 'Indica la sigla della provincia (es. RM).')),
}).refine((data) => data.sdi || data.pec, {message: 'Indica il codice SDI oppure la PEC.', path: ['sdi']});

export function billingFromClient(fields: AirtableWowproClient): BillingDetails {
  return {
    company: fields.fatt_ragione_sociale || fields.ragione_sociale || '', vatNumber: fields.fatt_partita_iva || '', taxCode: fields.fatt_codice_fiscale || '',
    sdi: fields.fatt_codice_sdi || '', pec: fields.fatt_pec || '', address: fields.fatt_indirizzo || '', zip: fields.fatt_cap || '', city: fields.fatt_citta || '', province: fields.fatt_provincia || '',
  };
}

export function billingToClient(billing: BillingDetails): Partial<AirtableWowproClient> {
  return {
    fatt_ragione_sociale: billing.company, fatt_partita_iva: billing.vatNumber, fatt_codice_fiscale: billing.taxCode, fatt_codice_sdi: billing.sdi,
    fatt_pec: billing.pec || undefined, fatt_indirizzo: billing.address, fatt_cap: billing.zip, fatt_citta: billing.city, fatt_provincia: billing.province,
  };
}
