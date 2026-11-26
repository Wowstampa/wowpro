import 'server-only';

import {escapeHtml, sendEmail} from '@/lib/email';
import {createAdminClient} from '@/lib/supabase/admin.server';

// Recipients: ALERT_EMAIL (comma separated) when set, otherwise the active admins.
async function recipients() {
  const configured = (process.env.ALERT_EMAIL || '').split(',').map((value) => value.trim()).filter(Boolean);
  if (configured.length) return configured;
  const {data} = await createAdminClient().from('profiles').select('email').eq('role', 'admin').eq('status', 'active');
  return (data || []).map((row) => row.email as string);
}

export async function notifyServerError({path, method, message, digest, stack, kind}: {path: string; method: string; message: string; digest: string | null; stack: string; kind: string}) {
  const when = new Intl.DateTimeFormat('it-IT', {dateStyle: 'short', timeStyle: 'medium', timeZone: 'Europe/Rome'}).format(new Date());
  const text = `Errore sul portale WOWPRO\n\n${method} ${path} (${kind})\n${when}\n\n${message}${digest ? `\nCodice: ${digest}` : ''}\n\n${stack.split('\n').slice(0, 8).join('\n')}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:620px;color:#0a0d15"><p style="font-size:12px;letter-spacing:.08em;color:#b42318;font-weight:bold">WOWPRO · ERRORE SERVER</p><h2 style="margin:0 0 6px">${escapeHtml(method)} ${escapeHtml(path)}</h2><p style="margin:0 0 14px;color:#5b6575">${escapeHtml(when)} · ${escapeHtml(kind)}${digest ? ` · codice ${escapeHtml(digest)}` : ''}</p><pre style="white-space:pre-wrap;padding:12px 14px;border-radius:8px;background:#f6f7f9;font-size:12px">${escapeHtml(message)}\n\n${escapeHtml(stack.split('\n').slice(0, 8).join('\n'))}</pre></div>`;
  for (const to of await recipients()) await sendEmail({to, subject: `Errore WOWPRO · ${method} ${path}`.slice(0, 140), html, text});
}
