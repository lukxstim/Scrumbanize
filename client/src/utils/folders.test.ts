import { describe, expect, it } from 'vitest';
import type { Folder, Note } from '../types/note';
import { buildFolderTree, canMoveFolder, flattenFolders, folderPath, freeFolderName } from './folders';

const folder = (id: number, name: string, parentId: number | null, position = id): Folder => ({ id, projectId: 1, parentId, name, position });
const note = (id: number, folderId: number | null): Note => ({
  id,
  projectId: 1,
  folderId,
  position: null,
  color: null,
  title: `N${id}`,
  content: '',
  tags: [],
  tasks: [],
  attachments: [],
  createdAt: '',
  updatedAt: '',
});

// Uni ─ Mathe ─ Analysis
//     └ Physik
// Rezepte (first by position)
const folders = [folder(1, 'Uni', null, 2), folder(2, 'Mathe', 1), folder(3, 'Analysis', 2), folder(4, 'Physik', 1, 9), folder(5, 'Rezepte', null, 1)];

describe('buildFolderTree', () => {
  it('nests folders in their order and counts the notes below each', () => {
    const tree = buildFolderTree(folders, [note(1, 3), note(2, 1), note(3, null), note(4, 99)]);
    expect(tree.roots.map((n) => n.folder.name)).toEqual(['Rezepte', 'Uni']);
    const uni = tree.roots[1]!;
    expect(uni.children.map((n) => [n.folder.name, n.depth])).toEqual([
      ['Mathe', 2],
      ['Physik', 2],
    ]);
    expect(uni.noteCount).toBe(2);
    expect(uni.notes.map((n) => n.id)).toEqual([2]);
    // Notes of a vanished folder show at the top level.
    expect(tree.looseNotes.map((n) => n.id)).toEqual([3, 4]);
  });
});

describe('folder helpers', () => {
  it('give the path of a folder', () => {
    expect(folderPath(folders, 3).map((f) => f.name)).toEqual(['Uni', 'Mathe', 'Analysis']);
    expect(folderPath(folders, null)).toEqual([]);
  });

  it('prevent cycles and more than five levels', () => {
    expect(canMoveFolder(folders, 1, 3)).toBe(false);
    expect(canMoveFolder(folders, 2, 2)).toBe(false);
    expect(canMoveFolder(folders, 5, 3)).toBe(true); // level 4
    const deep = [...folders, folder(6, 'Tief', 3), folder(7, 'Tiefer', 6)];
    expect(canMoveFolder(deep, 5, 7)).toBe(false); // level 6
    // Uni has three levels: into Rezepte makes four.
    expect(canMoveFolder(folders, 1, 5)).toBe(true);
    expect(canMoveFolder(deep, 1, 5)).toBe(false); // Uni now has five levels: six
  });

  it('find a free name among the siblings', () => {
    expect(freeFolderName(folders, 1)).toBe('Neuer Ordner');
    expect(freeFolderName([...folders, folder(9, 'neuer ordner', 1), folder(10, 'Neuer Ordner 2', 1)], 1)).toBe('Neuer Ordner 3');
    expect(freeFolderName([folder(9, 'Neuer Ordner', 1)], null)).toBe('Neuer Ordner');
  });

  it('flatten the tree in order', () => {
    expect(flattenFolders(folders).map(({ folder: f, depth }) => `${depth}:${f.name}`)).toEqual(['1:Rezepte', '1:Uni', '2:Mathe', '3:Analysis', '2:Physik']);
  });
});
