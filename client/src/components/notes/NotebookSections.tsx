import { useDroppable } from '@dnd-kit/core';
import type { Folder, Note } from '../../types/note';
import { flattenFolders, MAX_FOLDER_DEPTH } from '../../utils/folders';
import { sectionColor, type SectionId } from '../../utils/sections';
import { PlusIcon } from '../icons';
import Menu from '../Menu';
import { iconButtonClass } from '../ui/styles';
import { RenameField, type FolderActions } from './FolderTree';

interface NotebookSectionsProps {
  folders: Folder[];
  notes: Note[];
  current: SectionId;
  onSelect: (section: SectionId) => void;
  onCreateSection: (parentId: number | null) => void;
  canEdit: boolean;
  actions: FolderActions;
  renamingId: number | null;
  onRenamingChange: (folderId: number | null) => void;
  /** While a page is dragged (US-34): the section under it. */
  dropTarget: SectionId | undefined;
}

/** The droppable of a section, for pages dragged from the list beside it. */
export const sectionDropId = (section: SectionId) => `section:${section ?? 'none'}`;

/**
 * The sections of the open notebook under its name in the sidebar (US-34, like OneNote): its folders with a color
 * bar, subfolders indented, and "Ohne Abschnitt" for the pages without folder while there are some. Pages from the
 * list beside it are dropped onto a section to move them there.
 */
export default function NotebookSections({
  folders,
  notes,
  current,
  onSelect,
  onCreateSection,
  canEdit,
  actions,
  renamingId,
  onRenamingChange,
  dropTarget,
}: NotebookSectionsProps) {
  const count = (section: SectionId) => notes.filter((n) => n.folderId === section).length;
  const loose = count(null);

  return (
    <ul aria-label="Abschnitte" className="space-y-0.5 py-0.5">
      {(loose > 0 || folders.length === 0) && (
        <SectionRow section={null} name="Ohne Abschnitt" depth={1} count={loose} active={current === null} onSelect={onSelect} target={dropTarget === null} />
      )}
      {flattenFolders(folders).map(({ folder, depth }) => (
        <SectionRow
          key={folder.id}
          section={folder.id}
          name={folder.name}
          depth={depth}
          count={count(folder.id)}
          active={current === folder.id}
          onSelect={onSelect}
          target={dropTarget === folder.id}
          renaming={renamingId === folder.id}
          onRenamed={async (name) => {
            onRenamingChange(null);
            if (name && name !== folder.name) await actions.renameFolder(folder.id, name);
          }}
          menu={
            canEdit
              ? [
                  { label: 'Neue Seite hier', onSelect: () => actions.createNoteIn(folder.id) },
                  {
                    label: 'Neuer Unterabschnitt',
                    onSelect: () => onCreateSection(folder.id),
                    disabledReason: depth >= MAX_FOLDER_DEPTH ? `Abschnitte gehen höchstens ${MAX_FOLDER_DEPTH} Ebenen tief.` : undefined,
                  },
                  { label: 'Umbenennen', onSelect: () => onRenamingChange(folder.id) },
                  { label: 'Verschieben nach …', onSelect: () => actions.moveFolderRequest(folder) },
                  { label: 'Löschen …', onSelect: () => actions.deleteFolder(folder), danger: true },
                ]
              : undefined
          }
        />
      ))}
      {canEdit && (
        <li>
          <button
            type="button"
            onClick={() => onCreateSection(null)}
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent pointer-coarse:h-11"
          >
            <PlusIcon className="size-3.5" />
            Neuer Abschnitt
          </button>
        </li>
      )}
    </ul>
  );
}

interface SectionRowProps {
  section: SectionId;
  name: string;
  depth: number;
  count: number;
  active: boolean;
  onSelect: (section: SectionId) => void;
  target: boolean;
  renaming?: boolean;
  onRenamed?: (name: string) => Promise<void>;
  menu?: { label: string; onSelect: () => void; disabledReason?: string; danger?: boolean }[];
}

function SectionRow({ section, name, depth, count, active, onSelect, target, renaming = false, onRenamed, menu }: SectionRowProps) {
  const { setNodeRef } = useDroppable({ id: sectionDropId(section), data: { folderId: section } });
  return (
    <li
      ref={setNodeRef}
      style={{ paddingLeft: `${(depth - 1) * 0.875}rem` }}
      className={`group flex items-center gap-0.5 rounded-md transition-colors ${target ? 'bg-accent-muted ring-1 ring-accent ring-inset' : ''}`}
    >
      {renaming && onRenamed ? (
        <RenameField name={name} onDone={onRenamed} />
      ) : (
        <button
          type="button"
          aria-current={active ? 'page' : undefined}
          onClick={() => onSelect(section)}
          onDoubleClick={() => menu && menu.find((m) => m.label === 'Umbenennen')?.onSelect()}
          className={`flex h-8 min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 text-left text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent pointer-coarse:h-11 ${
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
