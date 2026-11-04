import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { ReactNode } from 'react';
import type { Folder, Note } from '../../types/note';
import { flattenFolders, MAX_FOLDER_DEPTH } from '../../utils/folders';
import { sectionColor, type SectionId } from '../../utils/sections';
import { PlusIcon } from '../icons';
import Menu from '../Menu';
import { iconButtonClass } from '../ui/styles';
import { RenameField, type FolderActions } from './FolderTree';

interface NotebookSectionsProps {
  projectId: number;
  folders: Folder[];
  notes: Note[];
  /** The section shown; undefined for a notebook that is only open in the sidebar. */
  current: SectionId | undefined;
  onSelect: (section: SectionId) => void;
  /** Without them, the sections are only shown (another open notebook, US-34): no menus, no "Neuer Abschnitt". */
  edit?: {
    onCreateSection: (parentId: number | null) => void;
    actions: FolderActions;
    renamingId: number | null;
    onRenamingChange: (folderId: number | null) => void;
  };
}

/** What a section takes when a page is dropped on it (US-34): pages also move into other notebooks. */
export interface SectionDrop {
  projectId: number;
  folderId: SectionId;
}

/** A section being dragged (US-34): it goes before the section it is dropped on, or to the end at "Neuer Abschnitt". */
export interface DraggedSection {
  projectId: number;
  sectionId: number;
}

/** Where a dragged section is dropped: before a section, or (`end`) after the last one at the top level. */
export type SectionPlace = { projectId: number; before: number } | { projectId: number; end: true };

/**
 * The sections of the open notebook under its name in the sidebar (US-34, like OneNote): its folders with a color
 * bar, subfolders indented, and "Ohne Abschnitt" for the pages without folder while there are some. Pages from the
 * list beside it are dropped onto a section to move them there; sections themselves are dragged into a new place.
 */
export default function NotebookSections({
  projectId,
  folders,
  notes,
  current,
  onSelect,
  edit,
}: NotebookSectionsProps) {
  const count = (section: SectionId) => notes.filter((n) => n.folderId === section).length;
  const loose = count(null);

  return (
    <ul aria-label="Abschnitte" className="space-y-0.5 py-0.5">
      {(loose > 0 || folders.length === 0) && (
        <SectionRow projectId={projectId} section={null} name="Ohne Abschnitt" depth={1} count={loose} active={current === null} onSelect={onSelect} />
      )}
      {flattenFolders(folders).map(({ folder, depth }) => (
        <SectionRow
          key={folder.id}
          projectId={projectId}
          section={folder.id}
          name={folder.name}
          depth={depth}
          count={count(folder.id)}
          active={current === folder.id}
          onSelect={onSelect}
          movable={edit !== undefined}
          renaming={edit?.renamingId === folder.id}
          onRenamed={async (name) => {
            if (!edit) return;
            edit.onRenamingChange(null);
            if (name && name !== folder.name) await edit.actions.renameFolder(folder.id, name);
          }}
          menu={
            edit
              ? [
                  { label: 'Neue Seite hier', onSelect: () => edit.actions.createNoteIn(folder.id) },
                  {
                    label: 'Neuer Unterabschnitt',
                    onSelect: () => edit.onCreateSection(folder.id),
                    disabledReason: depth >= MAX_FOLDER_DEPTH ? `Abschnitte gehen höchstens ${MAX_FOLDER_DEPTH} Ebenen tief.` : undefined,
                  },
                  { label: 'Umbenennen', onSelect: () => edit.onRenamingChange(folder.id) },
                  { label: 'Verschieben nach …', onSelect: () => edit.actions.moveFolderRequest(folder) },
                  { label: 'Löschen …', onSelect: () => edit.actions.deleteFolder(folder), danger: true },
                ]
              : undefined
          }
        />
      ))}
      {edit && (
        <EndSlot projectId={projectId}>
          <button
            type="button"
            onClick={() => edit.onCreateSection(null)}
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent pointer-coarse:h-11"
          >
            <PlusIcon className="size-3.5" />
            Neuer Abschnitt
          </button>
        </EndSlot>
      )}
    </ul>
  );
}

interface SectionRowProps {
  projectId: number;
  section: SectionId;
  name: string;
  depth: number;
  count: number;
  active: boolean;
  onSelect: (section: SectionId) => void;
  /** The shown notebook's sections can be dragged into a new place. */
  movable?: boolean;
  renaming?: boolean;
  onRenamed?: (name: string) => Promise<void>;
  menu?: { label: string; onSelect: () => void; disabledReason?: string; danger?: boolean }[];
}

/** A section is dragged (and not a page): it would go before the row under the pointer, shown by a line. */
const isSection = (data: Record<string, unknown> | undefined) => data?.section !== undefined;

/** The line where a dragged section would go. */
const PlaceLine = () => <span aria-hidden="true" className="pointer-events-none absolute inset-x-1 -top-px h-0.5 rounded-full bg-accent" />;

/** "Neuer Abschnitt", which also takes a section dragged to the end. */
function EndSlot({ projectId, children }: { projectId: number; children: ReactNode }) {
  const { setNodeRef, isOver, active } = useDroppable({ id: `section-end:${projectId}`, data: { place: { projectId, end: true } satisfies SectionPlace } });
  return (
    <li ref={setNodeRef} className="relative">
      {isOver && isSection(active?.data.current) && <PlaceLine />}
      {children}
    </li>
  );
}

/** One section: a click shows its pages, a page dropped on it moves there. */
export function SectionRow({ projectId, section, name, depth, count, active, onSelect, movable = false, renaming = false, onRenamed, menu }: SectionRowProps) {
  const drop = useDroppable({
    id: `section:${projectId}:${section ?? 'none'}`,
    data: { drop: { projectId, folderId: section } satisfies SectionDrop, place: section === null ? undefined : ({ projectId, before: section } satisfies SectionPlace) },
  });
  const drag = useDraggable({
    id: `section-item:${projectId}:${section ?? 'none'}`,
    data: { section: section === null ? undefined : ({ projectId, sectionId: section } satisfies DraggedSection) },
    disabled: !movable || section === null || renaming,
  });
  const sectionOver = drop.isOver && isSection(drop.active?.data.current);
  const pageOver = drop.isOver && !sectionOver;
  return (
    <li
      ref={drop.setNodeRef}
      style={{ paddingLeft: `${(depth - 1) * 0.875}rem` }}
      className={`group relative flex items-center gap-0.5 rounded-md transition-colors ${pageOver ? 'bg-accent-muted ring-1 ring-accent ring-inset' : ''} ${
        drag.isDragging ? 'opacity-40' : ''
      }`}
    >
      {sectionOver && section !== null && !drag.isDragging && <PlaceLine />}
      {renaming && onRenamed ? (
        <RenameField name={name} onDone={onRenamed} />
      ) : (
        <button
          ref={drag.setNodeRef}
          {...drag.listeners}
          type="button"
          aria-current={active ? 'page' : undefined}
          onClick={() => onSelect(section)}
          onDoubleClick={() => menu && menu.find((m) => m.label === 'Umbenennen')?.onSelect()}
          className={`flex h-8 min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 text-left text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent pointer-coarse:h-11 touch-manipulation select-none ${
            active ? 'bg-surface-strong font-medium text-fg' : 'text-fg-muted hover:bg-surface-hover hover:text-fg'
          }`}
        >
          <span className={`h-4 w-1 shrink-0 rounded-full ${sectionColor(section)}`} aria-hidden="true" />
          <span className={`flex-1 truncate ${section === null ? 'italic' : ''}`}>{name}</span>
          <span className={`text-xs text-fg-subtle tabular-nums ${menu ? 'group-hover:hidden group-focus-within:hidden' : ''}`}>{count}</span>
        </button>
      )}
      {menu && !renaming && (
        <div className="hidden group-hover:block group-focus-within:block pointer-coarse:block">
          <Menu
            label={`Abschnitt „${name}“: Aktionen`}
            trigger={<span aria-hidden="true">⋯</span>}
            triggerClassName={`${iconButtonClass} !size-7`}
            items={menu}
          />
        </div>
      )}
    </li>
  );
}
