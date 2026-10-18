import { useEffect, useRef, useState, type DragEvent } from 'react';
import type { Folder } from '../../types/note';
import { canMoveFolder, MAX_FOLDER_DEPTH, type FolderNode, type FolderTree as Tree } from '../../utils/folders';
import { ChevronRightIcon, FolderIcon } from '../icons';
import Menu from '../Menu';
import { iconButtonClass } from '../ui/styles';
import NoteListItem from './NoteListItem';

/** What is dragged in the tree: a note or a folder (native drag and drop; the dialogs are the keyboard way). */
const NOTE_TYPE = 'application/x-scrumbanize-note';
const FOLDER_TYPE = 'application/x-scrumbanize-folder';

export interface FolderActions {
  createNoteIn: (folderId: number) => void;
  createFolder: (parentId: number | null) => void;
  renameFolder: (id: number, name: string) => Promise<void>;
  /** Opens "Verschieben nach …" for the folder. */
  moveFolderRequest: (folder: Folder) => void;
  deleteFolder: (folder: Folder) => void;
  dropNote: (noteId: number, folderId: number | null) => void;
  dropFolder: (folderId: number, parentId: number | null) => void;
}

interface FolderTreeProps {
  tree: Tree;
  folders: Folder[];
  selectedId: number | null;
  onSelect: (noteId: number) => void;
  expanded: number[];
  onToggle: (folderId: number) => void;
  /** Folder whose name is being edited, e.g. right after creating it. */
  renamingId: number | null;
  onRenamingChange: (folderId: number | null) => void;
  /** Viewers (US-21) only browse: no menus, no dragging. */
  canEdit: boolean;
  actions: FolderActions;
}

type Dragged = { type: 'note' | 'folder'; id: number };

/** The notes sidebar as a tree (US-22): folders, open or closed, with their notes; notes without folder at the end. */
export default function FolderTree({ tree, folders, selectedId, onSelect, expanded, onToggle, renamingId, onRenamingChange, canEdit, actions }: FolderTreeProps) {
  const [dragged, setDragged] = useState<Dragged | null>(null);
  // The folder under the pointer while dragging; null: the top level.
  const [dropTarget, setDropTarget] = useState<number | null | undefined>(undefined);

  const accepts = (folderId: number | null) =>
    dragged !== null && (dragged.type === 'note' || canMoveFolder(folders, dragged.id, folderId));

  function startDrag(event: DragEvent, item: Dragged) {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(item.type === 'note' ? NOTE_TYPE : FOLDER_TYPE, String(item.id));
    setDragged(item);
  }

  function endDrag() {
    setDragged(null);
    setDropTarget(undefined);
  }

  // A folder takes drops anywhere in its area, also on its notes. One that cannot take the dragged folder (its own
  // subfolder, too deep) refuses, and the drop does not fall through to the folder around it or the top level.
  const dropHandlers = (folderId: number | null) => ({
    onDragOver: (event: DragEvent) => {
      if (!dragged) return;
      event.stopPropagation();
      if (!accepts(folderId)) {
        setDropTarget(undefined);
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDropTarget(folderId);
    },
    onDrop: (event: DragEvent) => {
      if (!dragged) return;
      event.stopPropagation();
      if (!accepts(folderId)) return;
      event.preventDefault();
      if (dragged.type === 'note') actions.dropNote(dragged.id, folderId);
      else if (folders.find((f) => f.id === dragged.id)?.parentId !== folderId) actions.dropFolder(dragged.id, folderId);
      endDrag();
    },
  });

  function renderNode(node: FolderNode) {
    const { folder, depth } = node;
    const open = expanded.includes(folder.id);
    const target = dragged !== null && dropTarget === folder.id;
    return (
      <li key={`f${folder.id}`} {...dropHandlers(folder.id)}>
        <div
          draggable={canEdit && renamingId !== folder.id}
          onDragStart={(event) => startDrag(event, { type: 'folder', id: folder.id })}
          onDragEnd={endDrag}
          style={{ paddingLeft: `${0.5 + (depth - 1) * 0.875}rem` }}
          className={`group flex items-center gap-0.5 pr-2 transition-colors duration-100 ${
            target ? 'bg-accent-muted ring-1 ring-accent ring-inset' : 'hover:bg-surface-hover'
          } ${dragged?.type === 'folder' && dragged.id === folder.id ? 'opacity-50' : ''}`}
        >
          {renamingId === folder.id ? (
            <RenameField
              name={folder.name}
              onDone={async (name) => {
                onRenamingChange(null);
                if (name && name !== folder.name) await actions.renameFolder(folder.id, name);
              }}
            />
          ) : (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => onToggle(folder.id)}
              onDoubleClick={() => canEdit && onRenamingChange(folder.id)}
              className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left text-sm font-medium text-fg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            >
              <ChevronRightIcon className={`size-3.5 shrink-0 text-fg-subtle transition-transform duration-150 ${open ? 'rotate-90' : ''}`} />
              <FolderIcon className="size-3.5 shrink-0 text-fg-subtle" />
              <span className="truncate">{folder.name}</span>
              {node.noteCount > 0 && <span className="shrink-0 text-xs font-normal text-fg-subtle tabular-nums">{node.noteCount}</span>}
            </button>
          )}
          {canEdit && renamingId !== folder.id && (
            <span className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100">
              <Menu
                label={`Ordner „${folder.name}“: Aktionen`}
                triggerClassName={`${iconButtonClass} !size-6`}
                trigger={<span aria-hidden="true" className="text-base leading-none">⋯</span>}
                items={[
                  { label: 'Neue Notiz hier', onSelect: () => actions.createNoteIn(folder.id) },
                  {
                    label: 'Neuer Unterordner',
                    onSelect: () => actions.createFolder(folder.id),
                    disabledReason: depth >= MAX_FOLDER_DEPTH ? `Ordner gehen höchstens ${MAX_FOLDER_DEPTH} Ebenen tief.` : undefined,
                  },
                  { label: 'Umbenennen', onSelect: () => onRenamingChange(folder.id) },
                  { label: 'Verschieben nach …', onSelect: () => actions.moveFolderRequest(folder) },
                  { label: 'Löschen …', onSelect: () => actions.deleteFolder(folder), danger: true },
                ]}
              />
            </span>
          )}
        </div>
        {open && (
          <ul>
            {node.children.map(renderNode)}
            {node.notes.map((note) => (
              <NoteListItem
                key={note.id}
                note={note}
                depth={depth}
                selected={note.id === selectedId}
                onSelect={onSelect}
                dragProps={canEdit ? { onDragStart: (event) => startDrag(event, { type: 'note', id: note.id }), onDragEnd: endDrag } : undefined}
              />
            ))}
            {node.children.length === 0 && node.notes.length === 0 && (
              <li style={{ paddingLeft: `${2.25 + (depth - 1) * 0.875}rem` }} className="py-1 text-xs text-fg-faint">
                Leer
              </li>
            )}
          </ul>
        )}
      </li>
    );
  }

  const topTarget = dragged !== null && dropTarget === null;
  return (
    <div
      {...dropHandlers(null)}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(undefined);
      }}
      className={`min-h-full pb-6 transition-colors ${topTarget ? 'bg-accent-muted/50' : ''}`}
    >
      {tree.roots.length > 0 && <ul className="border-b border-line py-1">{tree.roots.map(renderNode)}</ul>}
      {tree.looseNotes.length > 0 && (
        <ul className="divide-y divide-line">
          {tree.looseNotes.map((note) => (
            <NoteListItem
              key={note.id}
              note={note}
              selected={note.id === selectedId}
              onSelect={onSelect}
              dragProps={canEdit ? { onDragStart: (event) => startDrag(event, { type: 'note', id: note.id }), onDragEnd: endDrag } : undefined}
            />
          ))}
        </ul>
      )}
      {dragged && (
        <p className={`mx-3 mt-3 rounded-md border border-dashed px-3 py-2 text-center text-xs ${topTarget ? 'border-accent text-accent-text' : 'border-line-strong text-fg-subtle'}`}>
          Hier ablegen: oberste Ebene
        </p>
      )}
    </div>
  );
}

/** The folder name as a field: Enter or leaving saves, Escape keeps the old name. */
function RenameField({ name, onDone }: { name: string; onDone: (name: string) => Promise<void> }) {
  const [value, setValue] = useState(name);
  const input = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  function finish(result: string) {
    if (done.current) return;
    done.current = true;
    void onDone(result.trim());
  }

  return (
    <input
      ref={input}
      value={value}
      maxLength={80}
      aria-label="Ordnername"
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => finish(value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') finish(value);
        if (event.key === 'Escape') finish(name);
      }}
      className="my-0.5 ml-5 min-w-0 flex-1 rounded border border-accent bg-surface px-1.5 py-0.5 text-sm text-fg focus:outline-none"
    />
  );
}
