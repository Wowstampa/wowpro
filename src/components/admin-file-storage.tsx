'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {Archive, CheckCircle2, Download, HardDrive} from 'lucide-react';

import {formatBytes} from '@/components/request-files';

export function AdminFileStorage({archivableBytes, archivableIds, archiveAfterDays, fileCount, limitBytes, usedBytes}: {archivableBytes: number; archivableIds: string[]; archiveAfterDays: number; fileCount: number; limitBytes: number; usedBytes: number}) {
  const router = useRouter();
  const [downloaded, setDownloaded] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [message, setMessage] = useState('');
  const ratio = Math.min(usedBytes / limitBytes, 1);
  const tone = ratio > 0.85 ? 'danger' : ratio > 0.6 ? 'warn' : 'ok';

  async function purge() {
    setIsPurging(true); setMessage('');
    try {
      const response = await fetch('/api/admin/files/purge', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({fileIds: archivableIds})});
      const result = await response.json() as {deleted?: number; freedBytes?: number; error?: string};
      if (!response.ok) throw new Error(result.error || 'Pulizia non riuscita.');
      setMessage(`Spazio liberato: ${formatBytes(result.freedBytes || 0)} (${result.deleted} file).`);
      setDownloaded(false);
      router.refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Pulizia non riuscita.');
    } finally { setIsPurging(false); }
  }

  return <section className={`file-storage file-storage--${tone}`}>
    <div className="file-storage__usage">
      <span className="metric-icon metric-icon--green"><HardDrive size={18} /></span>
      <div>
        <p>Spazio file allegati</p>
        <strong>{formatBytes(usedBytes)} <small>di {formatBytes(limitBytes)} · {fileCount} file</small></strong>
        <span className="file-storage__bar"><i style={{width: `${Math.max(ratio * 100, 1)}%`}} /></span>
      </div>
    </div>
    <div className="file-storage__archive">
      {archivableIds.length ? <>
        <p><b>{archivableIds.length} file</b> ({formatBytes(archivableBytes)}) di richieste chiuse da più di {archiveAfterDays} giorni possono essere archiviati.</p>
        <div className="file-storage__actions">
          <form action="/api/admin/files/archive" method="post" onSubmit={() => setDownloaded(true)}>
            <input name="fileIds" type="hidden" value={JSON.stringify(archivableIds)} />
            <button className="client-action" type="submit"><Download size={15} />Scarica archivio ZIP</button>
          </form>
          <button className="client-action client-action--archive-confirm" disabled={!downloaded || isPurging} onClick={purge} title={downloaded ? '' : 'Scarica prima l’archivio'} type="button"><Archive size={15} />{isPurging ? 'Pulizia...' : 'Ho salvato l’archivio, libera spazio'}</button>
        </div>
        {downloaded && !message ? <small className="file-storage__hint">Controlla che lo ZIP si apra correttamente sul tuo computer, poi libera lo spazio.</small> : null}
      </> : <p className="file-storage__empty"><CheckCircle2 size={16} />Nessun file da archiviare: gli allegati diventano archiviabili {archiveAfterDays} giorni dopo la chiusura della richiesta.</p>}
      {message ? <p className="file-storage__message">{message}</p> : null}
    </div>
  </section>;
}
