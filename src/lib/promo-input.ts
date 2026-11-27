import 'server-only';

import {z} from 'zod';

import type {Promo} from '@/lib/promos';

const iso = z.string().trim().refine((value) => !Number.isNaN(Date.parse(value)), 'Data non valida.');
export const promoSchema = z.object({
  title: z.string().trim().min(3, 'Inserisci un titolo.').max(120),
  description: z.string().trim().max(600).default(''),
  discountType: z.enum(['percentage', 'amount']),
  value: z.coerce.number().positive('Inserisci lo sconto.').max(100_000),
  scope: z.enum(['all', 'collection']),
  collectionId: z.string().trim().max(120).nullable().default(null),
  collectionTitle: z.string().trim().max(200).nullable().default(null),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,40}$/, 'Il codice può contenere solo lettere, numeri, - e _ (3-40 caratteri).'),
  link: z.string().trim().max(500).default(''),
  earlyStartsAt: iso,
  publicStartsAt: iso.nullable().default(null),
  endsAt: iso.nullable().default(null),
  shopifyMode: z.enum(['auto', 'manual']),
}).refine((data) => data.discountType !== 'percentage' || data.value <= 100, {message: 'La percentuale non può superare 100.', path: ['value']})
  .refine((data) => !data.publicStartsAt || Date.parse(data.publicStartsAt) > Date.parse(data.earlyStartsAt), {message: 'L’uscita pubblica deve essere dopo l’inizio dell’anteprima.', path: ['publicStartsAt']})
  .refine((data) => !data.endsAt || Date.parse(data.endsAt) > Date.parse(data.publicStartsAt || data.earlyStartsAt), {message: 'La fine deve essere dopo l’uscita.', path: ['endsAt']})
  .refine((data) => data.scope === 'all' || !!data.collectionId, {message: 'Scegli la collezione.', path: ['collectionId']});

export function toPromo(input: z.infer<typeof promoSchema>, previous: Promo | null): Promo {
  const now = new Date().toISOString();
  const iso = (value: string | null) => value ? new Date(value).toISOString() : null;
  const early = new Date(input.earlyStartsAt).toISOString();
  return {
    id: previous?.id || crypto.randomUUID(),
    title: input.title,
    description: input.description,
    discountType: input.discountType,
    value: input.value,
    scope: input.scope,
    collectionId: input.scope === 'collection' ? input.collectionId : null,
    collectionTitle: input.scope === 'collection' ? input.collectionTitle : null,
    code: input.code,
    link: input.link,
    earlyStartsAt: early,
    publicStartsAt: iso(input.publicStartsAt),
    endsAt: iso(input.endsAt),
    image: previous?.image || null,
    shopify: {mode: input.shopifyMode, discountId: input.shopifyMode === 'auto' ? previous?.shopify.discountId || null : null, openedToAll: previous?.shopify.openedToAll || false, error: null},
    // Moving the start into the future again re-arms the launch email.
    notifiedAt: previous && previous.earlyStartsAt === early ? previous.notifiedAt : null,
    watchers: previous?.watchers || [],
    createdAt: previous?.createdAt || now,
    updatedAt: now,
  };
}
