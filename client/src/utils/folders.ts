import type { Folder, Note } from '../types/note';

/** Like the server (US-22): a folder in a folder … five levels. */
export const MAX_FOLDER_DEPTH = 5;

/** A folder with what is inside it, for the sidebar's tree. */
export interface FolderNode {
  folder: Folder;
  /** 1 at the top level. */
  depth: number;
  children: FolderNode[];
  notes: Note[];
  /** Notes in this folder and all below it. */
  noteCount: number;
}

export interface FolderTree {
  roots: FolderNode[];
  /** Notes at the top level (or in a folder that no longer exists). */
  looseNotes: Note[];
}

const byPosition = (a: Folder, b: Folder) => a.position - b.position || a.id - b.id;

/** Folders nested by parent, in their order; notes keep the order they come in. */
export function buildFolderTree(folders: Folder[], notes: Note[]): FolderTree {
  const known = new Set(folders.map((f) => f.id));
  const build = (parentId: number | null, depth: number): FolderNode[] =>
    folders
      .filter((f) => f.parentId === parentId)
      .sort(byPosition)
      .map((folder) => {
        const children = build(folder.id, depth + 1);
        const own = notes.filter((n) => n.folderId === folder.id);
        return { folder, depth, children, notes: own, noteCount: own.length + children.reduce((sum, c) => sum + c.noteCount, 0) };
      });
  return { roots: build(null, 1), looseNotes: notes.filter((n) => n.folderId === null || !known.has(n.folderId)) };
}

/** The folder and its ancestors, outermost first; empty for the top level. */
export function folderPath(folders: Folder[], folderId: number | null): Folder[] {
  const path: Folder[] = [];
  for (let id = folderId; id !== null; ) {
    const folder = folders.find((f) => f.id === id);
    if (!folder || path.includes(folder)) break;
    path.unshift(folder);
    id = folder.parentId;
  }
  return path;
}

/** How deep a folder sits: 1 at the top level, 0 for "no folder". */
export const folderDepth = (folders: Folder[], folderId: number | null) => folderPath(folders, folderId).length;

/** Levels of a folder and everything below it: 1 without subfolders. */
export function subtreeHeight(folders: Folder[], folderId: number): number {
  const children = folders.filter((f) => f.parentId === folderId);
  return 1 + Math.max(0, ...children.map((c) => subtreeHeight(folders, c.id)));
}

/** Whether `folderId` can move into `parentId` (null: the top level): not into itself or below, at most five levels. */
export function canMoveFolder(folders: Folder[], folderId: number, parentId: number | null): boolean {
  if (parentId !== null && folderPath(folders, parentId).some((f) => f.id === folderId)) return false;
  return folderDepth(folders, parentId) + subtreeHeight(folders, folderId) <= MAX_FOLDER_DEPTH;
}

/** "Neuer Ordner", or "Neuer Ordner 2", 3 … if a sibling has the name already (case-insensitive, like the server). */
export function freeFolderName(folders: Folder[], parentId: number | null, base = 'Neuer Ordner'): string {
  const taken = new Set(folders.filter((f) => f.parentId === parentId).map((f) => f.name.toLocaleLowerCase('de')));
  if (!taken.has(base.toLocaleLowerCase('de'))) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`.toLocaleLowerCase('de'))) return `${base} ${n}`;
}

/** Every folder in tree order with its depth, e.g. for a "Verschieben nach …" list. */
export function flattenFolders(folders: Folder[]): { folder: Folder; depth: number }[] {
  const walk = (nodes: FolderNode[]): { folder: Folder; depth: number }[] =>
    nodes.flatMap((node) => [{ folder: node.folder, depth: node.depth }, ...walk(node.children)]);
  return walk(buildFolderTree(folders, []).roots);
}
