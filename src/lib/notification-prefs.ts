import 'server-only';

import {createAdminClient} from '@/lib/supabase/admin.server';

// Which service emails a client user wants. Everything is on until they switch it off in Impostazioni.
export type NotificationCategory = 'grafica' | 'preventivi' | 'messaggi';
export type NotificationPrefs = Record<NotificationCategory, boolean>;
export const DEFAULT_PREFS: NotificationPrefs = {grafica: true, preventivi: true, messaggi: true};

export const readPrefs = (value: unknown): NotificationPrefs => ({...DEFAULT_PREFS, ...((value && typeof value === 'object' ? value : {}) as Partial<NotificationPrefs>)});

// Drops the client users who switched this category off (team members are never filtered).
export async function filterByPreference<T extends {id: string}>(recipients: T[], category: NotificationCategory): Promise<T[]> {
  if (!recipients.length) return recipients;
  const {data, error} = await createAdminClient().from('profiles').select('id,role,notification_prefs').in('id', recipients.map((recipient) => recipient.id));
  if (error) return recipients;
  const optedOut = new Set((data || []).filter((row) => row.role === 'client' && !readPrefs(row.notification_prefs)[category]).map((row) => row.id as string));
  return recipients.filter((recipient) => !optedOut.has(recipient.id));
}
