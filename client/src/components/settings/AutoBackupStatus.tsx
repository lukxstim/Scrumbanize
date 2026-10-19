import { useEffect, useState } from 'react';
import { backupApi, type BackupStatus } from '../../utils/api';
import { formatSize } from '../../utils/attachments';
import { formatDate } from '../../utils/format';

/**
 * The daily backups of a server (US-23), for administrators: when they run, the last one, and what went wrong.
 * Nothing where there are none (desktop app, BACKUP_TIME=off).
 */
export default function AutoBackupStatus() {
  const [status, setStatus] = useState<BackupStatus | null>(null);

  useEffect(() => {
    backupApi.status().then(setStatus, () => {
      // Without the status the section still offers the download.
    });
  }, []);

  if (!status?.schedule) return null;
  const { schedule, last, error, folder } = status;

  return (
    <div className="mt-4 border-t border-line pt-4 text-sm">
      <p className="text-fg">
        <span className="font-medium">Automatisch:</span> täglich um {schedule.time} Uhr ({schedule.timeZone}), die letzten {schedule.keep}{' '}
        werden aufgehoben.
      </p>
      <p className="mt-1 text-fg-subtle">
        {last ? (
          <>
            Zuletzt am {formatDate(last.at)}
            {last.size !== null && ` · ${formatSize(last.size)}`}
            {last.file && <span className="text-fg-faint"> · backups/taeglich/{last.file}</span>}
          </>
        ) : (
          'Noch kein automatisches Backup.'
        )}
      </p>
      {folder === 'not_writable' && (
        <p role="alert" className="mt-2 text-danger-text">
          Der Backup-Ordner ist nicht beschreibbar, daher entstehen keine Backups. Auf dem Server: <code>sudo chown 1000:1000 backups</code>.
        </p>
      )}
      {error && folder === 'ok' && (
        <p role="alert" className="mt-2 text-danger-text">
          Das letzte automatische Backup am {formatDate(error.at)} ist fehlgeschlagen: {error.message}
        </p>
      )}
    </div>
  );
}
