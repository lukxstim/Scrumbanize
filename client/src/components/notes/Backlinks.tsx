import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { Backlink, ContentRef } from '../../types/link';
import { linksApi } from '../../utils/api';
import { paths } from '../../utils/paths';
import { BoardIcon, LinkIcon, NoteIcon } from '../icons';

/**
 * "Verlinkt von" (US-22): notes and tasks whose text links here, from any project or notebook the user may see.
 * Loaded when the note or task opens; hidden while there are none.
 */
export default function Backlinks({ target, projectId }: { target: ContentRef; projectId: number }) {
  const [backlinks, setBacklinks] = useState<Backlink[]>([]);
  const { type, id } = target;

  useEffect(() => {
    let current = true;
    linksApi
      .backlinks({ type, id })
      .then((list) => current && setBacklinks(list))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [type, id]);

  if (backlinks.length === 0) return null;
  return (
    <section aria-label="Verlinkt von" className="rounded-lg border border-line px-4 py-3">
      <h3 className="flex items-center gap-1.5 text-sm font-medium text-fg-muted">
        <LinkIcon className="size-3.5" />
        Verlinkt von <span className="font-normal text-fg-subtle tabular-nums">{backlinks.length}</span>
      </h3>
      <ul className="mt-2 space-y-1">
        {backlinks.map((link) => (
          <li key={`${link.type}:${link.id}`}>
            <Link
              to={link.type === 'note' ? paths.notes(link.projectId, link.id) : paths.task(link.projectId, link.id)}
              className="flex items-center gap-2 rounded px-1 py-0.5 text-sm text-fg-muted hover:bg-surface-hover hover:text-fg"
            >
              {link.type === 'note' ? <NoteIcon className="size-3.5 shrink-0 text-fg-subtle" /> : <BoardIcon className="size-3.5 shrink-0 text-fg-subtle" />}
              {link.type === 'task' && <span className="shrink-0 font-mono text-xs text-fg-subtle">#{link.id}</span>}
              <span className="min-w-0 flex-1 truncate">{link.title || (link.type === 'note' ? 'Unbenannte Notiz' : 'Ohne Titel')}</span>
              {link.projectId !== projectId && <span className="max-w-40 shrink-0 truncate text-xs text-fg-subtle">{link.projectName}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
