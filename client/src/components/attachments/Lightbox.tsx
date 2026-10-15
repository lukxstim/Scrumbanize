import { useState } from 'react';
import type { Attachment } from '../../types/attachment';
import { fileUrl, formatSize, isImage } from '../../utils/attachments';
import { ChevronLeftIcon, ChevronRightIcon } from '../icons';
import Dialog from '../ui/Dialog';
import { iconButtonClass } from '../ui/styles';

interface LightboxProps {
  /** Images and PDFs that can be stepped through. */
  items: Attachment[];
  startId: number;
  onClose: () => void;
  onRemove: (attachment: Attachment) => void;
}

/** Large preview of an image or PDF; ← and → step through the others. Open while mounted. */
export default function Lightbox({ items, startId, onClose, onRemove }: LightboxProps) {
  const [index, setIndex] = useState(() => Math.max(0, items.findIndex((a) => a.id === startId)));
  const current = items[index];
  if (!current) return null;
  const step = (direction: -1 | 1) => setIndex((i) => (i + direction + items.length) % items.length);

  return (
    <Dialog onClose={onClose} closeOnBackdrop labelledBy="lightbox-title" className="flex h-[90vh] max-w-5xl flex-col overflow-hidden">
      <div
        className="flex min-h-0 flex-1 flex-col"
        onKeyDown={(event) => {
          if (items.length < 2 || (event.target as HTMLElement).tagName === 'IFRAME') return;
          if (event.key === 'ArrowLeft') step(-1);
          if (event.key === 'ArrowRight') step(1);
        }}
      >
        <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <h2 id="lightbox-title" className="truncate text-sm font-semibold text-fg">
              {current.fileName}
            </h2>
            <p className="text-xs text-fg-subtle">
              {formatSize(current.size)}
              {items.length > 1 && ` · ${index + 1} von ${items.length}`}
            </p>
          </div>
          {items.length > 1 && (
            <>
              <button type="button" onClick={() => step(-1)} aria-label="Vorheriger Anhang" className={iconButtonClass}>
                <ChevronLeftIcon />
              </button>
              <button type="button" onClick={() => step(1)} aria-label="Nächster Anhang" className={iconButtonClass}>
                <ChevronRightIcon />
              </button>
            </>
          )}
          <a
            href={fileUrl(current.id, true)}
            download={current.fileName}
            className="rounded-md px-2 py-1 text-xs font-medium text-fg-muted hover:bg-surface-hover hover:text-fg"
          >
            Herunterladen
          </a>
          <button
            type="button"
            onClick={() => onRemove(current)}
            className="rounded-md px-2 py-1 text-xs font-medium text-danger-text hover:bg-danger-muted"
          >
            Entfernen
          </button>
          <button type="button" onClick={onClose} aria-label="Schließen" className={`text-lg leading-none ${iconButtonClass}`} data-autofocus>
            ×
          </button>
        </div>
        <div className="grid min-h-0 flex-1 place-items-center bg-surface-muted">
          {isImage(current) ? (
            <img key={current.id} src={fileUrl(current.id)} alt={current.fileName} className="max-h-full max-w-full object-contain" />
          ) : (
            <iframe key={current.id} src={fileUrl(current.id)} title={current.fileName} className="size-full border-0 bg-white" />
          )}
        </div>
      </div>
    </Dialog>
  );
}
