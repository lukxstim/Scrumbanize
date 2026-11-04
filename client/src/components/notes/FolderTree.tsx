import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Folder, Note } from '../../types/note';
import { canMoveFolder, MAX_FOLDER_DEPTH, type FolderNode, type FolderTree as Tree } from '../../utils/folders';
import { haptic, isTouchActivation } from '../../utils/haptics';
import { UNTITLED_NOTE } from '../../utils/taskFromNote';
import { ChevronRightIcon, FolderIcon, NoteIcon } from '../icons';
import { isolate } from '../board/isolate';
import Menu from '../Menu';
import { iconButtonClass } from '../ui/styles';
import NoteListItem from './NoteListItem';

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
  /** The tree view (US-34): notes as one line with the title, inside the notebooks' sidebar. */
  compact?: boolean;
  showTags?: boolean;
}

type Dragged = { type: 'note' | 'folder'; id: number };

/** The droppable of a folder's area (its row, subfolders and notes), or of the top level (null). */
const dropId = (folderId: number | null) => (folderId === null ? 'top' : `folder:${folderId}`);

/**
 * A folder takes drops anywhere in its area, also on its notes and subfolders: of all the areas under the pointer,
 * the innermost (smallest) one is the target.
 */
const innermostArea: CollisionDetection = (args) => {
  const area = (id: string | number) => {
    const rect = args.droppableRects.get(id);
    return rect ? rect.width * rect.height : Infinity;
  };
  return pointerWithin(args).sort((a, b) => area(a.id) - area(b.id));
};

/**
 * The notes sidebar as a tree (US-22): folders, open or closed, with their notes; notes without folder at the end.
 * Notes and folders are dragged onto folders with the mouse or, on touch screens, by holding a finger on them for a
 * moment (US-25); the menus and "Verschieben nach …" are the way with the keyboard.
 */
export default function FolderTree({
  tree,
  folders,
  selectedId,
  onSelect,
  expanded,
  onToggle,
  renamingId,
  onRenamingChange,
  canEdit,
  actions,
  compact = false,
  showTags = true,
}: FolderTreeProps) {
  const [dragged, setDragged] = useState<Dragged | null>(null);
  // The folder under the pointer while dragging; null: the top level; undefined: none that takes it.
  const [dropTarget, setDropTarget] = useState<number | null | undefined>(undefined);
  const touchDrag = useRef(false);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // A short hold, so a swipe still scrolls the list.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  const accepts = (item: Dragged | null, folderId: number | null) =>
    item !== null && (item.type === 'note' || canMoveFolder(folders, item.id, folderId));

  /** The folder a droppable stands for; undefined for anything else. */
  const folderOf = (over: DragOverEvent['over']): number | null | undefined => over?.data.current?.folderId as number | null | undefined;

  function handleDragStart({ active, activatorEvent }: DragStartEvent) {
    setDragged(active.data.current?.item as Dragged);
    touchDrag.current = isTouchActivation(activatorEvent);
    if (touchDrag.current) haptic('pickUp');
  }

  function handleDragOver({ over }: DragOverEvent) {
    const folderId = folderOf(over);
    // One that cannot take the dragged folder (its own subfolder, too deep) refuses, and the drop does not fall
    // through to the folder around it or the top level.
    const next = folderId !== undefined && accepts(dragged, folderId) ? folderId : undefined;
    if (next !== dropTarget && next !== undefined && touchDrag.current) haptic('target');
    setDropTarget(next);
  }

  function handleDragEnd({ over }: DragEndEvent) {
    const item = dragged;
    const folderId = folderOf(over);
    endDrag();
    if (!item || folderId === undefined || !accepts(item, folderId)) return;
    if (item.type === 'note') {
      if (findNote(tree, item.id)?.folderId === folderId) return;
      actions.dropNote(item.id, folderId);
    } else {
      if (folders.find((f) => f.id === item.id)?.parentId === folderId) return;
      actions.dropFolder(item.id, folderId);
    }
    if (touchDrag.current) haptic('drop');
  }

  function endDrag() {
    setDragged(null);
    setDropTarget(undefined);
  }

  const view: TreeView = {
    folders,
    selectedId,
    onSelect,
    expanded,
    onToggle,
    renamingId,
    onRenamingChange,
    canEdit,
    actions,
    compact,
    showTags,
    dragged,
    dropTarget,
  };
  const topTarget = dragged !== null && dropTarget === null;
  const draggedFolder = dragged?.type === 'folder' ? folders.find((f) => f.id === dragged.id) : undefined;
  const draggedNote = dragged?.type === 'note' ? findNote(tree, dragged.id) : undefined;

  return (
    <DndContext sensors={sensors} collisionDetection={innermostArea} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd} onDragCancel={endDrag}>
      <DropArea folderId={null} className={`transition-colors ${compact ? 'rounded-md pb-1' : 'min-h-full pb-6'} ${topTarget ? 'bg-accent-muted/50' : ''}`}>
        {tree.roots.length > 0 && (
          <ul className={compact ? '' : 'border-b border-line py-1'}>
            {tree.roots.map((node) => (
              <FolderNodeView key={node.folder.id} node={node} view={view} />
            ))}
          </ul>
        )}
        {tree.looseNotes.length > 0 && (
          <ul className={compact ? '' : 'divide-y divide-line'}>
            {tree.looseNotes.map((note) => (
              <TreeNote key={note.id} note={note} view={view} />
            ))}
          </ul>
        )}
        {dragged && (
          <p className={`mx-3 mt-3 rounded-md border border-dashed px-3 py-2 text-center text-xs ${topTarget ? 'border-accent text-accent-text' : 'border-line-strong text-fg-subtle'}`}>
            Hier ablegen: oberste Ebene
          </p>
        )}
      </DropArea>

      {/* What follows the pointer or the finger: a lifted chip with the name. */}
      <DragOverlay dropAnimation={null}>
        {(draggedFolder || draggedNote) && (
          <div className="flex max-w-64 scale-105 cursor-grabbing items-center gap-1.5 rounded-md border border-accent-line bg-surface px-2.5 py-1.5 text-sm font-medium text-fg opacity-95 shadow-popover ring-1 ring-accent-line">
            {draggedFolder ? <FolderIcon className="size-3.5 shrink-0 text-fg-subtle" /> : <NoteIcon className="size-3.5 shrink-0 text-fg-subtle" />}
            <span className="truncate">{draggedFolder ? draggedFolder.name : draggedNote?.title || UNTITLED_NOTE}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

/** Everything a node of the tree needs from the tree. */
interface TreeView extends Omit<FolderTreeProps, 'tree'> {
  dragged: Dragged | null;
  dropTarget: number | null | undefined;
}

function findNote(tree: Tree, id: number): Note | undefined {
  const inNode = (node: FolderNode): Note | undefined => node.notes.find((n) => n.id === id) ?? node.children.map(inNode).find(Boolean);
  return tree.looseNotes.find((n) => n.id === id) ?? tree.roots.map(inNode).find(Boolean);
}

function DropArea({ folderId, className, children, as = 'div' }: { folderId: number | null; className?: string; children: ReactNode; as?: 'div' | 'li' }) {
  const { setNodeRef } = useDroppable({ id: dropId(folderId), data: { folderId } });
  const Tag = as;
  return (
    <Tag ref={setNodeRef} className={className}>
      {children}
    </Tag>
  );
}

/** Touch (US-25): no callout or text selection while a finger holds an item to pick it up. */
const holdClass = 'touch-manipulation select-none [-webkit-touch-callout:none]';

function FolderNodeView({ node, view }: { node: FolderNode; view: TreeView }) {
  const { folder, depth } = node;
  const { expanded, onToggle, renamingId, onRenamingChange, canEdit, actions, dragged, dropTarget } = view;
  const open = expanded.includes(folder.id);
  const target = dragged !== null && dropTarget === folder.id;
  const renaming = renamingId === folder.id;
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: `folder-item:${folder.id}`,
    data: { item: { type: 'folder', id: folder.id } satisfies Dragged },
    disabled: !canEdit || renaming,
  });

  return (
    <DropArea as="li" folderId={folder.id}>
      <div
        ref={setNodeRef}
        {...listeners}
        style={{ paddingLeft: `${0.5 + (depth - 1) * 0.875}rem` }}
        className={`group flex items-center gap-0.5 pr-2 transition-colors duration-100 ${view.compact ? 'rounded-md' : ''} ${holdClass} ${
          target ? 'bg-accent-muted ring-1 ring-accent ring-inset' : 'hover:bg-surface-hover'
        } ${isDragging ? 'opacity-50' : ''}`}
      >
        {renaming ? (
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
            className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left text-sm font-medium text-fg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent pointer-coarse:min-h-11"
          >
            <ChevronRightIcon className={`size-3.5 shrink-0 text-fg-subtle transition-transform duration-150 ${open ? 'rotate-90' : ''}`} />
            <FolderIcon className="size-3.5 shrink-0 text-fg-subtle" />
            <span className="truncate">{folder.name}</span>
            {node.noteCount > 0 && <span className="shrink-0 text-xs font-normal text-fg-subtle tabular-nums">{node.noteCount}</span>}
          </button>
        )}
        {canEdit && !renaming && (
          // The menu is no handle: pressing it must not pick the folder up.
          <span
            {...isolate}
            className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100 pointer-coarse:opacity-100"
          >
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
          {node.children.map((child) => (
            <FolderNodeView key={child.folder.id} node={child} view={view} />
          ))}
          {node.notes.map((note) => (
            <TreeNote key={note.id} note={note} depth={depth} view={view} />
          ))}
          {node.children.length === 0 && node.notes.length === 0 && (
            <li style={{ paddingLeft: `${2.25 + (depth - 1) * 0.875}rem` }} className="py-1 text-xs text-fg-faint">
              Leer
            </li>
          )}
        </ul>
      )}
    </DropArea>
  );
}

function TreeNote({ note, depth, view }: { note: Note; depth?: number; view: TreeView }) {
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: `note-item:${note.id}`,
    data: { item: { type: 'note', id: note.id } satisfies Dragged },
    disabled: !view.canEdit,
  });
  return (
    <NoteListItem
      note={note}
      depth={depth}
      selected={note.id === view.selectedId}
      onSelect={view.onSelect}
      compact={view.compact}
      showTags={view.showTags}
      drag={view.canEdit ? { setNodeRef, listeners, isDragging, className: holdClass } : undefined}
    />
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
      autoComplete="off"
      enterKeyHint="done"
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
