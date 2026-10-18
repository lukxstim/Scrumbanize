import { useCallback, useEffect, useState } from 'react';
import type { Attachment } from '../types/attachment';
import type { Note, NoteInput } from '../types/note';
import type { Task } from '../types/task';
import { notesApi, tasksApi, trashApi } from '../utils/api';
import type { TaskDraft } from '../utils/taskFromNote';

export type LoadStatus = 'loading' | 'ready' | 'error';

/** Loads the project's notes once and keeps the local list in sync with every successful API call. */
export function useNotes(projectId: number) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');

  const reload = useCallback(async () => {
    setStatus('loading');
    try {
      setNotes(await notesApi.list(projectId));
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const createNote = useCallback(async (title = '', content = '', tags: string[] = [], folderId: number | null = null): Promise<Note> => {
    const note = await notesApi.create(projectId, { title, content, tags }, folderId);
    setNotes((current) => [note, ...current]);
    return note;
  }, [projectId]);

  const saveNote = useCallback(async (id: number, input: NoteInput): Promise<void> => {
    const saved = await notesApi.update(id, input);
    // Keep the local task and attachment lists: a save sent before a task was created or a file was uploaded
    // would otherwise drop them.
    setNotes((current) =>
      current.map((note) => (note.id === id ? { ...saved, tasks: note.tasks, attachments: note.attachments } : note)),
    );
  }, []);

  /** Into a folder (US-22), or (null) to the top level. */
  const moveNote = useCallback(async (id: number, folderId: number | null): Promise<void> => {
    await notesApi.moveToFolder(id, folderId);
    setNotes((current) => current.map((note) => (note.id === id ? { ...note, folderId } : note)));
  }, []);

  /** After a folder was deleted, its notes moved up a level: take the new places from the server. */
  const refreshFolders = useCallback(async (): Promise<void> => {
    try {
      const fresh = await notesApi.list(projectId);
      const folderOf = new Map(fresh.map((note) => [note.id, note.folderId]));
      setNotes((current) => current.map((note) => ({ ...note, folderId: folderOf.get(note.id) ?? null })));
    } catch {
      // The old places stay until the next load.
    }
  }, [projectId]);

  const deleteNote = useCallback(async (id: number): Promise<void> => {
    await notesApi.remove(id);
    setNotes((current) => current.filter((note) => note.id !== id));
  }, []);

  /** `targetProjectId`: the task may go into another project (US-22), e.g. from a notebook. */
  const createTaskFromNote = useCallback(async (noteId: number, draft: TaskDraft, targetProjectId = projectId): Promise<Task> => {
    const task = await tasksApi.create(targetProjectId, { ...draft, sourceNoteId: noteId });
    // The server knows the column names; take the note's task list from there. Only the tasks change,
    // so an edit that is still being saved is not overwritten.
    const { tasks } = await notesApi.get(noteId);
    setNotes((current) => current.map((note) => (note.id === noteId ? { ...note, tasks } : note)));
    return task;
  }, [projectId]);

  /** Takes back a task just created from a note ("Rückgängig"): it is deleted for good, not kept in the trash. */
  const discardTask = useCallback(async (taskId: number): Promise<void> => {
    await tasksApi.remove(taskId);
    await trashApi.purge('task', taskId);
    setNotes((current) =>
      current.map((note) =>
        note.tasks.some((t) => t.id === taskId) ? { ...note, tasks: note.tasks.filter((t) => t.id !== taskId) } : note,
      ),
    );
  }, []);

  /** Applies an upload or removal to the note's attachment list. */
  const updateAttachments = useCallback((noteId: number, update: (attachments: Attachment[]) => Attachment[]) => {
    setNotes((current) => current.map((note) => (note.id === noteId ? { ...note, attachments: update(note.attachments) } : note)));
  }, []);

  return { notes, status, reload, updateAttachments, createNote, saveNote, moveNote, refreshFolders, deleteNote, createTaskFromNote, discardTask };
}
