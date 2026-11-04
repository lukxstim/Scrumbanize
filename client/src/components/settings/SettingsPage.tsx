import { lazy, Suspense, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { useAuth } from '../../hooks/useAuth';
import { desktopBridge } from '../../hooks/useDesktopSettings';
import { useCan } from '../../hooks/useProjectRole';
import { useProjects } from '../../hooks/useProjects';
import { useToast } from '../../hooks/useToast';
import { ApiError, backupApi, exportUrls, type PreparedRestore } from '../../utils/api';
import { formatDate } from '../../utils/format';
import { countLabel } from '../../utils/projects';
import ConfirmDialog from '../ConfirmDialog';
import { DownloadIcon, RestoreIcon } from '../icons';
import Button, { buttonClass } from '../ui/Button';
import { NotesViewOptions } from '../notes/NotesViewOptions';
import Section from '../ui/Section';
import AutoBackupStatus from './AutoBackupStatus';
import DesktopSection from './DesktopSection';
import TemplatesSection from './TemplatesSection';

const ImportWizard = lazy(() => import('../import/ImportWizard'));

const RESTORE_ERRORS: Record<string, string> = {
  invalid_backup: 'Die Datei ist kein gültiges Scrumbanize-Backup oder beschädigt.',
  backup_too_new: 'Das Backup stammt aus einer neueren Scrumbanize-Version. Bitte zuerst Scrumbanize aktualisieren.',
  file_too_large: 'Das Backup ist größer als 2 GB.',
  restore_expired: 'Das geprüfte Backup ist nicht mehr verfügbar. Bitte lade es erneut hoch.',
  restore_busy: 'Gerade läuft schon eine Wiederherstellung.',
};
const restoreError = (error: unknown) =>
  (error instanceof ApiError && RESTORE_ERRORS[error.code]) || 'Das Backup konnte nicht verarbeitet werden. Bitte versuche es erneut.';

const summary = (counts: PreparedRestore['counts']) =>
  [
    countLabel(counts.projects, 'Projekt', 'Projekte'),
    countLabel(counts.notes, 'Notiz', 'Notizen'),
    countLabel(counts.tasks, 'Task', 'Tasks'),
    countLabel(counts.attachments, 'Anhang', 'Anhänge'),
  ].join(' · ');

/** Settings of the whole installation at /p/:projectId/settings: backup, restore, import, exports, and the desktop app's own. */
export default function SettingsPage() {
  const projectId = Number(useParams().projectId);
  const { projects } = useProjects();
  const project = projects.find((p) => p.id === projectId);
  const [importing, setImporting] = useState(false);
  // A backup holds every project of every user, and a restore replaces them: administrators only (US-21).
  const isAdmin = useAuth().session?.user?.systemRole === 'admin';
  const canEdit = useCan('edit');

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-fg">Einstellungen</h1>
          <p className="mt-1 text-sm text-fg-subtle">
            {desktopBridge ? 'Sicherung, Wiederherstellung, Vorlagen, Import und Export deiner Daten sowie die Desktop-App.' : 'Sicherung, Wiederherstellung, Vorlagen, Import und Export deiner Daten.'}
          </p>
        </div>

        {desktopBridge && <DesktopSection />}

        <Section title="Notizen" description="So erscheinen deine Notizbücher und Seiten. Gilt in diesem Browser.">
          <NotesViewOptions idPrefix="settings" />
        </Section>

        {isAdmin && (
          <Section title="Backup" description="Eine ZIP-Datei mit allen Projekten, Notizen, Tasks, dem Aktivitätsprotokoll und allen Anhängen.">
            <a href={backupApi.downloadUrl} download className={buttonClass('primary', 'sm')}>
              <DownloadIcon className="size-3.5" />
              Backup herunterladen
            </a>
            <p className="mt-3 text-xs text-fg-subtle">Das Backup lässt sich erstellen, während Scrumbanize benutzt wird. Bewahre es an einem sicheren Ort auf.</p>
            <AutoBackupStatus />
          </Section>
        )}

        {isAdmin && <RestoreSection />}

        {project && <TemplatesSection projectId={project.id} projectName={project.name} />}

        {canEdit && (
          <Section title="Import" description="Markdown-Dateien, Ordner (z. B. Obsidian) oder ZIP-Exporte (z. B. Notion) als Notizen übernehmen.">
            <Button size="sm" onClick={() => setImporting(true)}>
              Notizen importieren …
            </Button>
          </Section>
        )}

        {project && (
          <Section title={`Export aus „${project.name}“`} description="Einzelne Notizen lassen sich auch direkt im Editor exportieren, das Board über die Leiste darüber.">
            <div className="flex flex-wrap gap-2">
              <a href={exportUrls.projectNotes(project.id, 'md')} download className={buttonClass('secondary', 'sm')}>
                <DownloadIcon className="size-3.5" />
                Alle Notizen als Markdown (ZIP)
              </a>
              <a href={exportUrls.projectNotes(project.id, 'html')} download className={buttonClass('secondary', 'sm')}>
                <DownloadIcon className="size-3.5" />
                Alle Notizen als HTML (ZIP)
              </a>
              <a href={exportUrls.boardCsv(project.id)} download className={buttonClass('secondary', 'sm')}>
                <DownloadIcon className="size-3.5" />
                Board als CSV
              </a>
            </div>
            <p className="mt-3 text-xs text-fg-subtle">Die ZIP-Dateien enthalten auch die Anhänge der Notizen. Die CSV-Datei ist für Excel vorbereitet.</p>
          </Section>
        )}
      </div>

      {importing && (
        <Suspense fallback={null}>
          <ImportWizard projectId={projectId} onClose={() => setImporting(false)} />
        </Suspense>
      )}
    </div>
  );
}


type RestoreState =
  | { kind: 'idle'; error?: string }
  | { kind: 'uploading'; progress: number; fileName: string }
  | { kind: 'prepared'; prepared: PreparedRestore; fileName: string }
  | { kind: 'restoring' };

/** Upload and check first, show what the backup contains, replace only after confirming. */
function RestoreSection() {
  // With login, a restore ends every session (backups contain none), so everyone logs in again (US-21).
  const withLogin = useAuth().session?.mode === 'required';
  const toast = useToast();
  const [state, setState] = useState<RestoreState>({ kind: 'idle' });
  const [confirming, setConfirming] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setState({ kind: 'uploading', progress: 0, fileName: file.name });
    try {
      const prepared = await backupApi.prepareRestore(file, (progress) => setState({ kind: 'uploading', progress, fileName: file.name }));
      setState({ kind: 'prepared', prepared, fileName: file.name });
    } catch (error) {
      setState({ kind: 'idle', error: restoreError(error) });
    }
  }

  async function cancel() {
    if (state.kind === 'prepared') void backupApi.cancelRestore(state.prepared.token).catch(() => {});
    setState({ kind: 'idle' });
  }

  async function restore() {
    if (state.kind !== 'prepared') return;
    setConfirming(false);
    const { token } = state.prepared;
    setState({ kind: 'restoring' });
    try {
      const result = await backupApi.restore(token);
      toast({
        message: `Backup wiederhergestellt: ${summary(result.counts)}. ${withLogin ? 'Bitte melde dich gleich neu an …' : 'Die App wird neu geladen …'}`,
      });
      // Every project, note and task may be different now.
      setTimeout(() => window.location.assign('/'), 1500);
    } catch (error) {
      setState({ kind: 'idle', error: restoreError(error) });
    }
  }

  return (
    <Section title="Wiederherstellen" description="Spielt ein Backup ein und ersetzt dabei alle aktuellen Daten.">
      <input
        ref={input}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void upload(file);
        }}
      />

      {state.kind === 'idle' && (
        <>
          <Button size="sm" onClick={() => input.current?.click()}>
            <RestoreIcon className="size-3.5" />
            Backup auswählen …
          </Button>
          {state.error && (
            <p role="alert" className="mt-3 rounded-lg bg-danger-muted px-3 py-2 text-sm text-danger-text">
              {state.error}
            </p>
          )}
        </>
      )}

      {state.kind === 'uploading' && (
        <div>
          <p className="text-sm text-fg-muted">
            „{state.fileName}“ wird {state.progress < 1 ? `hochgeladen (${Math.round(state.progress * 100)} %)` : 'geprüft'} …
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted">
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.round(state.progress * 100)}%` }} />
          </div>
        </div>
      )}

      {state.kind === 'prepared' && (
        <div className="space-y-3">
          <div className="rounded-lg border border-line bg-surface-muted px-4 py-3 text-sm">
            <p className="font-medium text-fg">{state.fileName}</p>
            <p className="mt-0.5 text-fg-muted">
              {state.prepared.manifest ? `Erstellt ${formatDate(state.prepared.manifest.createdAt)} · ` : 'Manuell erstelltes Backup · '}
              {summary(state.prepared.counts)}
            </p>
            {state.prepared.missingFiles > 0 && (
              <p className="mt-1 text-warning-text">
                {countLabel(state.prepared.missingFiles, 'Anhang fehlt', 'Anhänge fehlen')} im Archiv und {state.prepared.missingFiles === 1 ? 'wird' : 'werden'}{' '}
                danach nicht verfügbar sein.
              </p>
            )}
          </div>
          <p className="text-sm text-fg-muted">
            Alle aktuellen Daten werden durch dieses Backup ersetzt. Vorher wird automatisch eine Sicherung des jetzigen Stands im Ordner{' '}
            <code className="rounded bg-surface-muted px-1 text-xs">backups</code> des Datenverzeichnisses angelegt (die letzten 5 bleiben).
          </p>
          <div className="flex gap-2">
            <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
              Wiederherstellen …
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void cancel()}>
              Abbrechen
            </Button>
          </div>
        </div>
      )}

      {state.kind === 'restoring' && <p className="text-sm text-fg-muted">Backup wird eingespielt …</p>}

      <ConfirmDialog
        open={confirming}
        title="Alle Daten ersetzen?"
        message={`Alle Projekte, Notizen, Tasks und Anhänge werden durch das Backup ersetzt. Der jetzige Stand wird vorher gesichert.${
          withLogin
            ? ' Danach sind alle abgemeldet und melden sich mit den Konten aus dem Backup an. Enthält es keinen Administrator (z. B. aus der Desktop-App), bleibt dein Konto erhalten und wird Owner aller Projekte.'
            : ''
        }`}
        confirmLabel="Ersetzen"
        onConfirm={() => void restore()}
        onCancel={() => setConfirming(false)}
      />
    </Section>
  );
}
