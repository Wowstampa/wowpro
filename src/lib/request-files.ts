import 'server-only';

import type {CurrentProfile} from '@/lib/auth';
import {createAdminClient} from '@/lib/supabase/admin.server';

export const REQUEST_FILES_BUCKET = 'request-files';
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024;
export const ARCHIVE_AFTER_DAYS = 60;
export const ALLOWED_EXTENSIONS = ['pdf', 'ai', 'eps', 'svg', 'psd', 'jpg', 'jpeg', 'png', 'tif', 'tiff', 'zip'];

export type RequestFile = {id: string; name: string; size: number; createdAt: string};

let bucketReady = false;

// Creates the private bucket on first use, so no manual setup is needed in Supabase.
export async function ensureRequestFilesBucket() {
  if (bucketReady) return;
  const admin = createAdminClient();
  const {data} = await admin.storage.getBucket(REQUEST_FILES_BUCKET);
  if (!data) {
    const {error} = await admin.storage.createBucket(REQUEST_FILES_BUCKET, {public: false, fileSizeLimit: MAX_FILE_BYTES});
    if (error && !/already exists/i.test(error.message)) throw error;
  }
  bucketReady = true;
}

type RequestAccessRow = {id: string; company_id: string; assigned_to: string | null};

// Returns the request when the profile may read and attach files to it.
export async function getAccessibleRequest(profile: CurrentProfile, requestId: string) {
  if (profile.status !== 'active') return null;
  const {data} = await createAdminClient().from('graphic_requests').select('id,company_id,assigned_to').eq('id', requestId).maybeSingle<RequestAccessRow>();
  if (!data) return null;
  if (profile.role === 'staff' || profile.role === 'admin') return data;
  if (profile.role === 'client' && profile.company_id === data.company_id) return data;
  if (profile.role === 'graphic_operator' && data.assigned_to === profile.id) return data;
  return null;
}

export function fileExtension(name: string) {
  return (name.split('.').pop() || '').toLowerCase();
}

export function safeSegment(value: string, maxLength = 80) {
  return value.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[\\/:*?"<>|#%{}^~[\]`]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength) || 'file';
}

export async function listRequestFiles(requestIds: string[], {customerVisibleOnly = false} = {}) {
  const files = new Map<string, RequestFile[]>();
  if (!requestIds.length) return files;
  let query = createAdminClient().from('request_files').select('id,request_id,file_name,size_bytes,created_at,customer_visible').in('request_id', requestIds).order('created_at', {ascending: true});
  if (customerVisibleOnly) query = query.eq('customer_visible', true);
  const {data, error} = await query;
  if (error) return files;
  for (const row of data || []) {
    files.set(row.request_id, [...(files.get(row.request_id) || []), {id: row.id, name: row.file_name, size: Number(row.size_bytes || 0), createdAt: row.created_at}]);
  }
  return files;
}
