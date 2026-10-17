import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { unzip } from 'fflate';
import { useNavigate } from 'react-router';
import { useProjects } from '../../hooks/useProjects';
import { importApi } from '../../utils/api';
import {
  batchNotes,
  classifyFiles,
  commonRootFolder,
  DEFAULT_IMPORT_OPTIONS,
  isIgnored,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_FILES,
  MAX_NOTE_CONTENT,
  parseMarkdownNote,
  type ImportOptions,
  type SkippedFile,
} from '../../utils/importMarkdown';
import { paths } from '../../utils/paths';
import { countLabel } from '../../utils/projects';
import { FolderIcon, NoteIcon } from '../icons';
import Button from '../ui/Button';
import Dialog from '../ui/Dialog';
import { fieldClass, labelClass } from '../ui/styles';

/** A Markdown file as read from the disk or a ZIP. */
interface SourceFile {
  path: string;
  text: string;
}

type Step =
  | { kind: 'choose'; error?: string }
  | { kind: 'reading' }
  | { kind: 'preview' }
  | { kind: 'importing'; done: number; total: number }
  | { kind: 'done'; imported: number; renamed: number; failed: number };

const MB = 1024 * 1024;
const decoder = new TextDecoder('utf-8');

/** Paths in a ZIP may start with "./" or use backslashes (made on Windows). */
const cleanPath = (path: string) => path.replace(/\\/g, '/').replace(/^\.?\//, '');

function readZip(file: File): Promise<{ sources: SourceFile[]; others: string[] }> {
  return file.arrayBuffer().then(
    (buffer) =>
      new Promise((resolve, reject) => {
        const others: string[] = [];
        let total = 0;
        unzip(
          new Uint8Array(buffer),
          {
            // Only Markdown is unpacked; the rest is only listed.
            filter: (entry) => {
              const path = cleanPath(entry.name);
              if (path.endsWith('/') || isIgnored(path)) return false;
              total += entry.originalSize;
              if (!/\.(md|markdown|mdown|mkd)$/i.test(path)) {
                others.push(path);
                return false;
              }
              return true;
            },
          },
          (error, files) => {
            if (error) return reject(new Error('Die ZIP-Datei konnte nicht gelesen werden.'));
            if (total > MAX_IMPORT_BYTES) return reject(new Error('Der Inhalt der ZIP-Datei ist größer als 500 MB.'));
            resolve({ sources: Object.entries(files).map(([name, data]) => ({ path: cleanPath(name), text: decoder.decode(data) })), others });
          },
        );
      }),
  );
}

/** Markdown files, a folder (Obsidian vault) or a ZIP (Notion export) into notes of a project. */
export default function ImportWizard({ projectId, onClose }: { projectId: number; onClose: () => void }) {
  const navigate = useNavigate();
  const { projects } = useProjects();
  const [step, setStep] = useState<Step>({ kind: 'choose' });
  const [target, setTarget] = useState(projectId);
  const [options, setOptions] = useState<ImportOptions>(DEFAULT_IMPORT_OPTIONS);
  const [sources, setSources] = useState<SourceFile[]>([]);
  const [skipped, setSkipped] = useState<SkippedFile[]>([]);
  const [rootFolder, setRootFolder] = useState<string | undefined>(undefined);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);

  // Parsed again when an option changes; the files are only read once.
  const parsed = useMemo(() => sources.map((s) => parseMarkdownNote(s.path, s.text, options, rootFolder)), [sources, options, rootFolder]);
  const tooLarge = parsed.filter((n) => n.content.length > MAX_NOTE_CONTENT).map((n) => n.path);
  const chosen = parsed.filter((n) => !excluded.has(n.path) && !tooLarge.includes(n.path));

  async function read(files: File[], kind: 'files' | 'folder' | 'zip') {
    if (files.length === 0) return;
    setStep({ kind: 'reading' });
    try {
      let markdown: SourceFile[];
      let others: SkippedFile[];
      if (kind === 'zip') {
        const zip = await readZip(files[0]!);
        if (zip.sources.length + zip.others.length > MAX_IMPORT_FILES) throw new Error(`Die ZIP-Datei enthält mehr als ${MAX_IMPORT_FILES} Dateien.`);
        markdown = zip.sources;
        others = zip.others.map((path) => ({ path, reason: 'Kein Markdown (Bilder und Anhänge werden noch nicht importiert)' }));
        setRootFolder(commonRootFolder([...zip.sources.map((s) => s.path), ...zip.others]));
      } else {
        const entries = files.map((file) => ({ file, path: file.webkitRelativePath || file.name }));
        const { markdown: md, skipped: rest } = classifyFiles(entries);
        if (md.length + rest.length > MAX_IMPORT_FILES) throw new Error(`Es sind mehr als ${MAX_IMPORT_FILES} Dateien.`);
        const size = entries.reduce((sum, e) => sum + e.file.size, 0);
        if (size > MAX_IMPORT_BYTES) throw new Error('Die Dateien sind zusammen größer als 500 MB.');
        markdown = await Promise.all(md.map(async ({ file, path }) => ({ path, text: await file.text() })));
        others = rest;
        // The folder the user picked is the vault itself, not a tag.
        setRootFolder(kind === 'folder' ? entries[0]?.path.split('/')[0] : undefined);
      }
      if (markdown.length === 0) throw new Error('Keine Markdown-Dateien (.md) gefunden.');
      markdown.sort((a, b) => a.path.localeCompare(b.path, 'de'));
      setSources(markdown);
      setSkipped(others);
      setExcluded(new Set());
      setStep({ kind: 'preview' });
    } catch (error) {
      setStep({ kind: 'choose', error: error instanceof Error ? error.message : 'Die Dateien konnten nicht gelesen werden.' });
    }
  }

  const pick = (kind: 'files' | 'folder' | 'zip') => (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    void read(files, kind);
  };

  async function runImport() {
    const batches = batchNotes(chosen.map(({ title, content, tags, createdAt }) => ({ title, content, tags, createdAt })));
    let done = 0;
    let renamed = 0;
    let failed = 0;
    setStep({ kind: 'importing', done, total: chosen.length });
    for (const batch of batches) {
      try {
        const { created } = await importApi.notes(target, batch);
        renamed += created.filter((c, i) => c.title !== batch[i]!.title.trim()).length;
      } catch {
        failed += batch.length;
      }
      done += batch.length;
      setStep({ kind: 'importing', done, total: chosen.length });
    }
    setStep({ kind: 'done', imported: done - failed, renamed, failed });
  }

  const toggle = (path: string) =>
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const busy = step.kind === 'reading' || step.kind === 'importing';
  return (
    <Dialog onClose={onClose} labelledBy="import-title" dismissible={!busy} className="flex max-h-[88vh] max-w-3xl flex-col p-0">
      <div className="border-b border-line px-6 py-4">
        <h2 id="import-title" className="text-base font-semibold text-fg">
          Notizen importieren
        </h2>
        <p className="mt-0.5 text-sm text-fg-subtle">Markdown-Dateien, ein Ordner (z. B. ein Obsidian-Vault) oder eine ZIP-Datei (z. B. ein Notion-Export).</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {(step.kind === 'choose' || step.kind === 'reading') && (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <SourceButton icon={<NoteIcon className="size-5" />} title="Dateien" hint=".md-Dateien auswählen" disabled={busy} onClick={() => filesInput.current?.click()} />
              <SourceButton icon={<FolderIcon className="size-5" />} title="Ordner" hint="mit Unterordnern" disabled={busy} onClick={() => folderInput.current?.click()} />
              <SourceButton icon={<FolderIcon className="size-5" />} title="ZIP-Datei" hint="z. B. Notion-Export" disabled={busy} onClick={() => zipInput.current?.click()} />
            </div>
            <input ref={filesInput} type="file" accept=".md,.markdown,text/markdown" multiple hidden onChange={pick('files')} />
            {/* webkitdirectory picks a whole folder; React has no typed prop for it. */}
            <input ref={folderInput} type="file" hidden onChange={pick('folder')} {...{ webkitdirectory: '', directory: '' }} />
            <input ref={zipInput} type="file" accept=".zip,application/zip" hidden onChange={pick('zip')} />
            {step.kind === 'reading' && <p className="text-sm text-fg-subtle">Dateien werden gelesen …</p>}
            {step.kind === 'choose' && step.error && (
              <p role="alert" className="rounded-lg bg-danger-muted px-3 py-2 text-sm text-danger-text">
                {step.error}
              </p>
            )}
            <p className="text-xs text-fg-subtle">
              Bis zu {MAX_IMPORT_FILES.toLocaleString('de-DE')} Dateien und {MAX_IMPORT_BYTES / MB} MB. Importiert wird nur Text: Bilder und andere
              Dateien werden aufgelistet, aber nicht übernommen. Titel, Tags und Erstelldatum kommen aus dem Front Matter, wenn vorhanden.
            </p>
          </div>
        )}

        {step.kind === 'preview' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label htmlFor="import-target" className={labelClass}>
                  In Projekt
                </label>
                <select id="import-target" value={target} onChange={(e) => setTarget(Number(e.target.value))} className={`mt-1 w-56 ${fieldClass}`}>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-fg-muted">
                <input type="checkbox" checked={options.folderTags} onChange={(e) => setOptions({ ...options, folderTags: e.target.checked })} />
                Ordner als Tags
              </label>
              <label className="flex items-center gap-2 text-sm text-fg-muted">
                <input type="checkbox" checked={options.inlineTags} onChange={(e) => setOptions({ ...options, inlineTags: e.target.checked })} />
                #Tags im Text übernehmen
              </label>
            </div>

            <table className="w-full text-left text-sm [&_td]:py-1.5 [&_td]:pr-3 [&_th]:pb-2 [&_th]:pr-3 [&_th]:text-xs [&_th]:font-medium [&_th]:text-fg-subtle [&_tbody_tr]:border-t [&_tbody_tr]:border-line">
              <thead>
                <tr>
                  <th scope="col" className="w-8">
                    <input
                      type="checkbox"
                      aria-label="Alle auswählen"
                      checked={excluded.size === 0}
                      onChange={(e) => setExcluded(e.target.checked ? new Set() : new Set(parsed.map((n) => n.path)))}
                    />
                  </th>
                  <th scope="col">Titel</th>
                  <th scope="col">Tags</th>
                  <th scope="col">Datei</th>
                </tr>
              </thead>
              <tbody>
                {parsed.map((note) => {
                  const big = tooLarge.includes(note.path);
                  return (
                    <tr key={note.path} className={big ? 'opacity-50' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`„${note.title}“ importieren`}
                          disabled={big}
                          checked={!big && !excluded.has(note.path)}
                          onChange={() => toggle(note.path)}
                        />
                      </td>
                      <td className="max-w-56 truncate font-medium text-fg">{note.title}</td>
                      <td className="max-w-48 truncate text-xs text-fg-subtle">{note.tags.map((t) => `#${t}`).join(' ')}</td>
                      <td className="max-w-56 truncate text-xs text-fg-subtle" title={note.path}>
                        {big ? 'zu groß (über 1 Mio. Zeichen)' : note.path}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <SkippedList skipped={skipped} />
          </div>
        )}

        {step.kind === 'importing' && (
          <div className="py-8">
            <p className="text-sm text-fg">
              {step.done} von {step.total} Notizen importiert …
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuenow={step.done} aria-valuemax={step.total}>
              <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${(step.done / Math.max(1, step.total)) * 100}%` }} />
            </div>
          </div>
        )}

        {step.kind === 'done' && (
          <div className="space-y-3 py-2">
            <p className="text-sm font-medium text-fg">{countLabel(step.imported, 'Notiz', 'Notizen')} importiert.</p>
            {step.renamed > 0 && (
              <p className="text-sm text-fg-muted">
                {countLabel(step.renamed, 'Notiz hat', 'Notizen haben')} eine Nummer im Titel bekommen, z. B. „Titel (2)“, weil es den Titel schon gab.
              </p>
            )}
            {step.failed > 0 && <p className="text-sm text-danger-text">{countLabel(step.failed, 'Notiz konnte', 'Notizen konnten')} nicht importiert werden.</p>}
            <SkippedList skipped={skipped} />
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-3">
        {step.kind === 'preview' && (
          <>
            <span className="mr-auto text-xs text-fg-subtle">
              {countLabel(chosen.length, 'Notiz', 'Notizen')} ausgewählt
              {skipped.length > 0 && ` · ${countLabel(skipped.length, 'Datei', 'Dateien')} übersprungen`}
            </span>
            <Button variant="ghost" onClick={() => setStep({ kind: 'choose' })}>
              Zurück
            </Button>
            <Button variant="primary" disabled={chosen.length === 0} onClick={() => void runImport()}>
              {countLabel(chosen.length, 'Notiz', 'Notizen')} importieren
            </Button>
          </>
        )}
        {step.kind === 'done' && (
          <Button
            variant="primary"
            onClick={() => {
              onClose();
              navigate(paths.notes(target));
            }}
          >
            Zu den Notizen
          </Button>
        )}
        {!busy && step.kind !== 'done' && step.kind !== 'preview' && (
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
        )}
        {step.kind === 'done' && (
          <Button variant="ghost" onClick={onClose}>
            Schließen
          </Button>
        )}
      </div>
    </Dialog>
  );
}

function SourceButton({ icon, title, hint, disabled, onClick }: { icon: React.ReactNode; title: string; hint: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-xl border border-line bg-surface-muted px-4 py-5 text-center transition-colors hover:border-line-strong hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
    >
      <span className="text-fg-subtle">{icon}</span>
      <span className="text-sm font-medium text-fg">{title}</span>
      <span className="text-xs text-fg-subtle">{hint}</span>
    </button>
  );
}

function SkippedList({ skipped }: { skipped: SkippedFile[] }) {
  if (skipped.length === 0) return null;
  return (
    <details className="rounded-lg border border-line px-3 py-2 text-sm">
      <summary className="cursor-pointer text-fg-muted">{countLabel(skipped.length, 'Datei', 'Dateien')} übersprungen</summary>
      <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-xs text-fg-subtle">
        {skipped.map((file) => (
          <li key={file.path} className="truncate" title={`${file.path}: ${file.reason}`}>
            {file.path} <span className="text-fg-faint">· {file.reason}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
