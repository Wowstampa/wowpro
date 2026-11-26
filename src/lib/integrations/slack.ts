import 'server-only';

import {createHmac, timingSafeEqual} from 'node:crypto';

// Slack app used by the team to post client invoices in a dedicated channel.
export const slackConfigured = () => Boolean(process.env.SLACK_BOT_TOKEN && process.env.SLACK_SIGNING_SECRET);

// Verifies that a request really comes from Slack (signed with the app's signing secret, max 5 minutes old).
export function verifySlackSignature(body: string, timestamp: string | null, signature: string | null) {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret || !timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = `v0=${createHmac('sha256', secret).update(`v0:${timestamp}:${body}`).digest('hex')}`;
  const a = Buffer.from(expected); const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function slack<T>(method: string, body: Record<string, unknown>) {
  const response = await fetch(`https://slack.com/api/${method}`, {method: 'POST', headers: {Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json; charset=utf-8'}, body: JSON.stringify(body)});
  const data = await response.json() as T & {ok: boolean; error?: string};
  if (!data.ok) throw new Error(`Slack ${method}: ${data.error}`);
  return data;
}

export async function slackFileInfo(fileId: string) {
  const response = await fetch(`https://slack.com/api/files.info?file=${encodeURIComponent(fileId)}`, {headers: {Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`}});
  const data = await response.json() as {ok: boolean; error?: string; file?: {id: string; name: string; mimetype: string; size: number; url_private_download?: string; url_private?: string}};
  if (!data.ok || !data.file) throw new Error(`Slack files.info: ${data.error}`);
  return data.file;
}

export async function slackDownload(url: string) {
  const response = await fetch(url, {headers: {Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`}});
  if (!response.ok) throw new Error(`Download Slack ${response.status}`);
  return response.arrayBuffer();
}

export async function slackUserName(userId: string | undefined) {
  if (!userId) return null;
  try { const data = await slack<{user: {real_name?: string; name?: string}}>('users.info', {user: userId}); return data.user.real_name || data.user.name || null; } catch { return null; }
}

export async function slackReply(channel: string, threadTs: string, text: string) {
  try { await slack('chat.postMessage', {channel, thread_ts: threadTs, text}); } catch (error) { console.error('[Slack reply]', error); }
}
