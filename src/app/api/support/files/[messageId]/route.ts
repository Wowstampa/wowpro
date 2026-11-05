import {NextResponse} from 'next/server';

import {REQUEST_FILES_BUCKET} from '@/lib/request-files';
import {resolveConversation} from '@/lib/support-route';
import {createAdminClient} from '@/lib/supabase/admin.server';

export async function GET(_request: Request, {params}: {params: Promise<{messageId: string}>}) {
  const {messageId} = await params;
  const admin = createAdminClient();
  const {data: message} = await admin.from('support_messages').select('company_id,file_path,file_name').eq('id', messageId).maybeSingle();
  if (!message?.file_path) return NextResponse.json({error: 'File non trovato.'}, {status: 404});
  const resolved = await resolveConversation(message.company_id);
  if ('error' in resolved || resolved.company.id !== message.company_id) return NextResponse.json({error: 'File non trovato.'}, {status: 404});
  const {data, error} = await admin.storage.from(REQUEST_FILES_BUCKET).createSignedUrl(message.file_path, 120, {download: message.file_name || true});
  if (error || !data) return NextResponse.json({error: 'Il file non è più disponibile.'}, {status: 410});
  return NextResponse.redirect(data.signedUrl);
}
