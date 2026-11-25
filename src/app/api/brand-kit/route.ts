import {NextResponse} from 'next/server';
import {z} from 'zod';

import {readBrandKit, toBrandKitView, writeBrandKit, canEditBrandKit} from '@/lib/brand-kit';
import {resolveBrandKit} from '@/lib/brand-kit-route';

export async function GET(request: Request) {
  const resolved = await resolveBrandKit(new URL(request.url).searchParams.get('companyId'), 'read');
  if ('response' in resolved) return resolved.response;
  const kit = await readBrandKit(resolved.companyId);
  return NextResponse.json({kit: toBrandKitView(kit), canEdit: await canEditBrandKit(resolved.profile, resolved.companyId)}, {headers: {'Cache-Control': 'no-store'}});
}

const schema = z.object({
  companyId: z.string().uuid().optional(),
  colors: z.array(z.object({name: z.string().trim().max(60).default(''), hex: z.string().trim().regex(/^#[0-9a-f]{6}$/i, 'Colore non valido.')})).max(16),
  fonts: z.array(z.object({name: z.string().trim().min(1).max(80), usage: z.string().trim().max(120).default('')})).max(10),
  notes: z.string().trim().max(3000).default(''),
  website: z.string().trim().max(200).default(''),
});

export async function PUT(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({error: parsed.error.issues[0]?.message || 'Dati non validi.'}, {status: 400});
  const resolved = await resolveBrandKit(parsed.data.companyId, 'edit');
  if ('response' in resolved) return resolved.response;
  const kit = await readBrandKit(resolved.companyId);
  const {colors, fonts, notes, website} = parsed.data;
  try {
    await writeBrandKit(resolved.companyId, {...kit, colors: colors.map((color) => ({...color, hex: color.hex.toUpperCase()})), fonts, notes, website});
  } catch (error) {
    console.error('[Brand kit save]', error);
    return NextResponse.json({error: 'Brand kit non salvato. Riprova.'}, {status: 502});
  }
  return NextResponse.json({kit: toBrandKitView(await readBrandKit(resolved.companyId))});
}
