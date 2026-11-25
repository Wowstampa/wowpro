import 'server-only';

import type {CurrentProfile} from '@/lib/auth';
import {REQUEST_FILES_BUCKET, ensureRequestFilesBucket} from '@/lib/request-files';
import {canAccessConversation} from '@/lib/support';
import {createAdminClient} from '@/lib/supabase/admin.server';

// The client's brand kit (logos, colours, fonts, notes and reference files) lives in storage as a small JSON
// document next to the files, so the team finds it ready in every request without a database change.
export type BrandFile = {id: string; name: string; size: number; kind: 'logo' | 'file'; path: string; uploadedAt: string};
export type BrandKit = {colors: Array<{name: string; hex: string}>; fonts: Array<{name: string; usage: string}>; notes: string; website: string; files: BrandFile[]; updatedAt: string | null};
export type BrandKitView = Omit<BrandKit, 'files'> & {files: Array<Omit<BrandFile, 'path'> & {previewable: boolean}>};

export const EMPTY_BRAND_KIT: BrandKit = {colors: [], fonts: [], notes: '', website: '', files: [], updatedAt: null};
export const BRAND_FILE_EXTENSIONS = ['pdf', 'ai', 'eps', 'svg', 'psd', 'jpg', 'jpeg', 'png', 'webp', 'tif', 'tiff', 'zip', 'otf', 'ttf', 'woff', 'woff2'];
export const MAX_BRAND_FILES = 30;

const folder = (companyId: string) => `brandkit/${companyId}`;
const kitPath = (companyId: string) => `${folder(companyId)}/kit.json`;
export const brandFilePath = (companyId: string, fileId: string, extension: string) => `${folder(companyId)}/files/${fileId}.${extension}`;
const PREVIEWABLE = /\.(png|jpe?g|webp|svg)$/i;

export async function readBrandKit(companyId: string): Promise<BrandKit> {
  const {data, error} = await createAdminClient().storage.from(REQUEST_FILES_BUCKET).download(kitPath(companyId));
  if (error || !data) return {...EMPTY_BRAND_KIT};
  try { return {...EMPTY_BRAND_KIT, ...(JSON.parse(await data.text()) as Partial<BrandKit>)}; } catch { return {...EMPTY_BRAND_KIT}; }
}

export async function writeBrandKit(companyId: string, kit: BrandKit) {
  await ensureRequestFilesBucket();
  const body = JSON.stringify({...kit, updatedAt: new Date().toISOString()});
  const {error} = await createAdminClient().storage.from(REQUEST_FILES_BUCKET).upload(kitPath(companyId), new Blob([body], {type: 'application/json'}), {upsert: true, contentType: 'application/json'});
  if (error) throw error;
}

export function toBrandKitView(kit: BrandKit): BrandKitView {
  return {...kit, files: kit.files.map((file) => ({id: file.id, name: file.name, size: file.size, kind: file.kind, uploadedAt: file.uploadedAt, previewable: PREVIEWABLE.test(file.path)}))};
}

export const hasBrandKit = (kit: BrandKit) => kit.files.length > 0 || kit.colors.length > 0 || kit.fonts.length > 0;

// Who may see a company's brand kit: the client itself, admins and the account manager (as for the chat),
// and the designers assigned to one of the company's requests or to the company.
export async function canReadBrandKit(profile: CurrentProfile, companyId: string) {
  if (profile.status !== 'active') return false;
  if (profile.role === 'client') return profile.company_id === companyId;
  if (profile.role === 'admin' || profile.role === 'staff') return Boolean(await canAccessConversation(profile, companyId)) || profile.role === 'admin';
  if (profile.role === 'graphic_operator') {
    const admin = createAdminClient();
    const [{data: company}, {data: request}] = await Promise.all([
      admin.from('companies').select('id').eq('id', companyId).eq('designer_id', profile.id).maybeSingle(),
      admin.from('graphic_requests').select('id').eq('company_id', companyId).eq('assigned_to', profile.id).limit(1).maybeSingle(),
    ]);
    return Boolean(company || request);
  }
  return false;
}

// Editing: the client for its own kit, and the team members who manage the client.
export async function canEditBrandKit(profile: CurrentProfile, companyId: string) {
  if (profile.role === 'graphic_operator') return false;
  return canReadBrandKit(profile, companyId);
}
