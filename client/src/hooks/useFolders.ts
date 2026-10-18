import { useCallback, useEffect, useState } from 'react';
import type { Folder } from '../types/note';
import { foldersApi } from '../utils/api';

/**
 * The project's folders of notes (US-22). Every change reloads the list: moving or deleting a folder can change
 * the place of others (positions, folders moving up).
 */
export function useFolders(projectId: number) {
  const [folders, setFolders] = useState<Folder[]>([]);

  const reload = useCallback(async () => {
    try {
      setFolders(await foldersApi.list(projectId));
    } catch {
      // Without folders, all notes still show at the top level.
    }
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const createFolder = useCallback(
    async (name: string, parentId: number | null) => {
      const folder = await foldersApi.create(projectId, name, parentId);
      setFolders((current) => [...current, folder]);
      return folder;
    },
    [projectId],
  );

  const updateFolder = useCallback(
    async (id: number, patch: { name?: string; parentId?: number | null; index?: number }) => {
      await foldersApi.update(id, patch);
      await reload();
    },
    [reload],
  );

  const deleteFolder = useCallback(
    async (id: number) => {
      await foldersApi.remove(id);
      await reload();
    },
    [reload],
  );

  return { folders, reload, createFolder, updateFolder, deleteFolder };
}
