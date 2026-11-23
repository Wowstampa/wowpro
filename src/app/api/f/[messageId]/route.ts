import {NextResponse} from 'next/server';

import {verifyFileToken} from '@/lib/quote-draft';
import {REQUEST_FILES_BUCKET} from '@/lib/request-files';
import {createAdminClient} from '@/lib/supabase/admin.server';

// Download link written on Shopify order lines: valid only with its signed token.
export async function GET(request: Request, {params}: {params: Promise<{messageId: string}>}) {
  const {messageId} = await params;
  const token = new URL(request.url).searchParams.get('t') || '';
  if (!/^[0-9a-f-]{36}$/i.test(messageId) || !verifyFileToken(messageId, token)) return NextResponse.json({error: 'Link non valido.'}, {status: 404});
  const admin = createAdminClient();
  const {data: message} = await admin.from('quote_messages').select('file_path,file_name').eq('id', messageId).maybeSingle();
  if (!message?.file_path) return NextResponse.json({error: 'File non trovato.'}, {status: 404});
  const {data, error} = await admin.storage.from(REQUEST_FILES_BUCKET).createSignedUrl(message.file_path, 300, {download: message.file_name || true});
  if (error || !data) return NextResponse.json({error: 'Il file non è più disponibile (i file vengono archiviati dopo 60 giorni).'}, {status: 410});
  return NextResponse.redirect(data.signedUrl);
}
