import {after, NextResponse} from 'next/server';

import {fileInvoice, matchInvoiceClient, notifyInvoice} from '@/lib/invoices';
import {slackConfigured, slackDownload, slackFileInfo, slackReply, slackUserName, verifySlackSignature} from '@/lib/integrations/slack';

type SlackFile = {id: string; name?: string};
type SlackEvent = {type: string; subtype?: string; channel: string; user?: string; text?: string; ts: string; thread_ts?: string; files?: SlackFile[]; bot_id?: string};

// Slack Events API: a PDF posted in the invoices channel is filed under the client named in the message
// (order number, quote code, VAT number or client name). The bot replies in the thread with the outcome.
export async function POST(request: Request) {
  if (!slackConfigured()) return NextResponse.json({error: 'Slack non configurato.'}, {status: 503});
  const body = await request.text();
  if (!verifySlackSignature(body, request.headers.get('x-slack-request-timestamp'), request.headers.get('x-slack-signature'))) return NextResponse.json({error: 'Firma non valida.'}, {status: 401});
  const payload = JSON.parse(body) as {type: string; challenge?: string; event?: SlackEvent};
  if (payload.type === 'url_verification') return NextResponse.json({challenge: payload.challenge});
  const event = payload.event;
  const channel = process.env.SLACK_INVOICES_CHANNEL;
  // Slack retries when it gets no answer in 3 seconds: we answer at once and work afterwards.
  if (payload.type === 'event_callback' && event?.type === 'message' && event.files?.length && !event.bot_id && (!channel || event.channel === channel) && !request.headers.get('x-slack-retry-num')) {
    after(() => handleInvoiceMessage(event));
  }
  return NextResponse.json({ok: true});
}

async function handleInvoiceMessage(event: SlackEvent) {
  const thread = event.thread_ts || event.ts;
  try {
    const files = await Promise.all((event.files || []).map((file) => slackFileInfo(file.id)));
    const pdfs = files.filter((file) => file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.name));
    if (!pdfs.length) { await slackReply(event.channel, thread, 'Carico solo fatture in PDF: questo file non è un PDF.'); return; }
    const match = await matchInvoiceClient(`${event.text || ''} ${pdfs.map((file) => file.name).join(' ')}`);
    if (!match) {
      await slackReply(event.channel, thread, ':warning: Non ho capito a quale cliente appartiene la fattura. Ricaricala scrivendo nel messaggio il numero d’ordine (es. #WW121513), il codice del preventivo (PV-…), la partita IVA o il nome del cliente.');
      return;
    }
    const postedBy = await slackUserName(event.user);
    const filed: string[] = [];
    for (const file of pdfs) {
      const url = file.url_private_download || file.url_private;
      if (!url) continue;
      const result = await fileInvoice({companyId: match.companyId, fileId: file.id, name: file.name, bytes: await slackDownload(url), orderName: match.orderName, reference: (event.text || '').slice(0, 200) || null, postedBy});
      if (!result.duplicate) filed.push(file.name);
    }
    if (!filed.length) { await slackReply(event.channel, thread, 'Questa fattura era già stata caricata nel portale.'); return; }
    await notifyInvoice(match.companyId, filed.join(', '), match.orderName);
    await slackReply(event.channel, thread, `:white_check_mark: ${filed.length === 1 ? 'Fattura caricata' : `${filed.length} fatture caricate`} nel portale di *${match.companyName}* (riconosciuto da ${match.how}). Il cliente ha ricevuto un’email.`);
  } catch (error) {
    console.error('[Slack invoice]', error);
    await slackReply(event.channel, thread, ':x: Non sono riuscito a caricare la fattura nel portale. Riprova a caricarla tra qualche minuto.');
  }
}
