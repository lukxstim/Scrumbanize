import { useId, useRef, useState, type DragEvent } from 'react';
import type { Attachment, AttachmentOwner } from '../../types/attachment';
import { ApiError, attachmentsApi } from '../../utils/api';
import { ACCEPT, canPreview, fileLabel, fileProblem, fileUrl, formatSize, isImage, MAX_FILES_PER_UPLOAD } from '../../utils/attachments';
import { formatDate } from '../../utils/format';
import ConfirmDialog from '../ConfirmDialog';
import { PaperclipIcon } from '../icons';
import { labelClass } from '../ui/styles';
import Lightbox from './Lightbox';

interface AttachmentsPanelProps {
  owner: AttachmentOwner;
  attachments: Attachment[];
  /** Applies an upload or removal to the owner's list (see useNotes / useBoard). */
  onUpdate: (update: (attachments: Attachment[]) => Attachment[]) => void;
  /** Viewers (US-21): files open and download, but nothing is added or removed. */
  readOnly?: boolean;
}

interface Upload {
  key: number;
  names: string;
  progress: number;
  error?: string;
}

/** Why the server refused an upload, in German. */
function uploadError(error: unknown): string {
  switch (error instanceof ApiError ? error.code : undefined) {
    case 'file_too_large':
      return 'Eine Datei ist größer als 25 MB.';
    case 'unsupported_type':
      return 'Dieser Dateityp ist nicht erlaubt.';
    case 'too_many_files':
      return `Höchstens ${MAX_FILES_PER_UPLOAD} Dateien auf einmal.`;
    case 'not_found':
      return 'Die Notiz bzw. der Task existiert nicht mehr.';
    default:
      return 'Hochladen fehlgeschlagen.';
  }
}

let nextKey = 1;

/** "Anhänge": drop zone and upload button, images as thumbnails, other files as a list. */
export default function AttachmentsPanel({ owner, attachments, onUpdate, readOnly = false }: AttachmentsPanelProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [removing, setRemoving] = useState<Attachment | null>(null);
  const [removeFailed, setRemoveFailed] = useState(false);

  const images = attachments.filter(isImage);
  const files = attachments.filter((a) => !isImage(a));
  const previewable = attachments.filter(canPreview);

  function upload(list: File[]) {
    const rejected = list.map((file) => ({ file, problem: fileProblem(file) })).filter((r) => r.problem);
    const accepted = list.filter((file) => !fileProblem(file));
    const report = (names: string, error: string) => setUploads((current) => [...current, { key: nextKey++, names, progress: 0, error }]);
    for (const { file, problem } of rejected) report(file.name, `${file.name}: ${problem}`);

    for (let i = 0; i < accepted.length; i += MAX_FILES_PER_UPLOAD) {
      const batch = accepted.slice(i, i + MAX_FILES_PER_UPLOAD);
      const key = nextKey++;
      const names = batch.map((f) => f.name).join(', ');
      setUploads((current) => [...current, { key, names, progress: 0 }]);
      attachmentsApi
        .upload(owner, batch, (progress) => setUploads((current) => current.map((u) => (u.key === key ? { ...u, progress } : u))))
        .then((added) => {
          onUpdate((current) => [...current, ...added]);
          setUploads((current) => current.filter((u) => u.key !== key));
        })
        .catch((error: unknown) =>
          setUploads((current) => current.map((u) => (u.key === key ? { ...u, error: `${names}: ${uploadError(error)}` } : u))),
        );
    }
  }

  async function remove(attachment: Attachment) {
    setRemoving(null);
    setRemoveFailed(false);
    try {
      await attachmentsApi.remove(attachment.id);
      onUpdate((current) => current.filter((a) => a.id !== attachment.id));
    } catch {
      setRemoveFailed(true);
    }
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length > 0) upload([...event.dataTransfer.files]);
  };

  return (
    <section
      aria-labelledby={`${inputId}-heading`}
      onDragOver={(event) => {
        if (readOnly || !event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={onDrop}
      className={`rounded-lg border border-dashed p-3 transition-colors ${dragging ? 'border-accent bg-accent-muted' : 'border-line'}`}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 id={`${inputId}-heading`} className={`flex items-center gap-1.5 ${labelClass}`}>
          <PaperclipIcon className="size-3.5" />
          Anhänge {attachments.length > 0 && <span className="font-normal text-fg-subtle">({attachments.length})</span>}
        </h3>
        {!readOnly && (
          <span className="text-xs text-fg-subtle">
            Dateien hierher ziehen oder{' '}
            <label htmlFor={inputId} className="cursor-pointer font-medium text-accent-text hover:underline">
              auswählen
            </label>
          </span>
        )}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          onChange={(event) => {
            upload([...(event.target.files ?? [])]);
            event.target.value = '';
          }}
        />
      </div>

      {uploads.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1" aria-live="polite">
          {uploads.map((u) => (
            <li key={u.key} className="flex items-center gap-2 text-xs">
              {u.error ? (
                <>
                  <span role="alert" className="min-w-0 flex-1 truncate text-danger-text">
                    {u.error}
                  </span>
                  <button
                    type="button"
                    onClick={() => setUploads((current) => current.filter((x) => x.key !== u.key))}
                    className="text-fg-subtle hover:text-fg"
                  >
                    Ausblenden
                  </button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-fg-muted">Lädt hoch: {u.names}</span>
                  <progress value={u.progress} max={1} className="h-1.5 w-24 accent-accent" aria-label={`Fortschritt ${u.names}`} />
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {images.length > 0 && (
        <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2">
          {images.map((image) => (
            <li key={image.id} className="group/att relative">
              <button
                type="button"
                onClick={() => setPreviewId(image.id)}
                title={`${image.fileName} · ${formatSize(image.size)}`}
                className="block aspect-[4/3] w-full overflow-hidden rounded-md border border-line bg-surface-muted focus-visible:outline-2 focus-visible:outline-accent"
              >
                <img src={fileUrl(image.id)} alt={image.fileName} loading="lazy" className="size-full object-cover" />
              </button>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => setRemoving(image)}
                  aria-label={`„${image.fileName}“ entfernen`}
                  title="Entfernen"
                  className="absolute top-1 right-1 grid size-6 place-items-center rounded-md bg-surface/90 text-fg-muted opacity-0 shadow-card transition-opacity hover:text-danger-text focus-visible:opacity-100 group-hover/att:opacity-100 [@media(hover:none)]:opacity-100"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <ul className="mt-3 flex flex-col divide-y divide-line rounded-md border border-line bg-surface">
          {files.map((file) => (
            <li key={file.id} className="flex items-center gap-3 px-3 py-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded bg-surface-muted font-mono text-[10px] font-semibold text-fg-subtle ring-1 ring-line">
                {fileLabel(file.fileName)}
              </span>
              <div className="min-w-0 flex-1">
                {canPreview(file) ? (
                  <button type="button" onClick={() => setPreviewId(file.id)} className="block max-w-full truncate text-left text-sm text-fg hover:text-accent-text hover:underline">
                    {file.fileName}
                  </button>
                ) : (
                  <a href={fileUrl(file.id, true)} download={file.fileName} className="block truncate text-sm text-fg hover:text-accent-text hover:underline">
                    {file.fileName}
                  </a>
                )}
                <span className="text-xs text-fg-subtle">
                  {formatSize(file.size)} · {formatDate(file.createdAt)}
                </span>
              </div>
              <a
                href={fileUrl(file.id, true)}
                download={file.fileName}
                className="rounded px-1.5 py-0.5 text-xs font-medium text-fg-subtle hover:bg-surface-hover hover:text-fg"
                aria-label={`„${file.fileName}“ herunterladen`}
              >
                Herunterladen
              </a>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => setRemoving(file)}
                  aria-label={`„${file.fileName}“ entfernen`}
                  className="rounded px-1.5 py-0.5 text-xs font-medium text-fg-subtle hover:bg-danger-muted hover:text-danger-text"
                >
                  Entfernen
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {removeFailed && (
        <p role="alert" className="mt-2 text-xs text-danger-text">
          Der Anhang konnte nicht entfernt werden.
        </p>
      )}

      {previewId !== null && (
        <Lightbox items={previewable} startId={previewId} onClose={() => setPreviewId(null)} onRemove={(a) => setRemoving(a)} />
      )}
      <ConfirmDialog
        open={removing !== null}
        title="Anhang entfernen?"
        message={removing ? `„${removing.fileName}“ wird endgültig gelöscht. Das lässt sich nicht rückgängig machen.` : ''}
        confirmLabel="Entfernen"
        onConfirm={() => {
          if (!removing) return;
          if (previewId === removing.id) setPreviewId(null);
          void remove(removing);
        }}
        onCancel={() => setRemoving(null)}
      />
    </section>
  );
}
