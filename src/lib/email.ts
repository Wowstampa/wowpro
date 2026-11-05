import 'server-only';

// Sends a transactional email through Resend. Without RESEND_API_KEY it does nothing, so the portal keeps working.
export async function sendEmail({to, subject, html, text}: {to: string; subject: string; html: string; text: string}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({from: process.env.EMAIL_FROM || 'WOWPRO <accesso@wowstampa.it>', to: [to], subject, html, text}),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) console.error('[Email]', response.status, await response.text().catch(() => ''));
  return response.ok;
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[char] || char);
}
