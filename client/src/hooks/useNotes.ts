import { useCallback, useEffect, useRef, useState } from 'react';
import type { Attachment } from '../types/attachment';
import type { Note, NoteInput } from '../types/note';
import type { RealtimeActor } from '../types/realtime';
import type { Task } from '../types/task';
import { ApiError, notesApi, tasksApi, trashApi } from '../utils/api';
import { notifyNotesChanged } from '../utils/appEvents';
import { planNotes } from '../utils/realtime';
import type { TaskDraft } from '../utils/taskFromNote';
import { useRealtimeProject } from './useRealtime';

export type LoadStatus = 'loading' | 'ready' | 'error';

/** Someone else changed the note's text (US-24); `seq` grows with every such change. */
export interface RemoteEdit {
  seq: number;
  by: RealtimeActor | null;
}

const load = (projectId: number | null) => (projectId === null ? notesApi.listAll() : notesApi.list(projectId));

/**
 * Loads the project's notes once and keeps the local list in sync with every successful API call. With `null`, the
 * notes of every project and notebook the user can see ("Alle Notizen", US-22); new notes then need a project.
 */
export function useNotes(projectId: number | null) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');

  /** `quietly`: without the loading state, for changes from elsewhere; a failure keeps the list as it is. */
  const reload = useCallback(
    async (quietly = false) => {
      if (!quietly) setStatus('loading');
      try {
        setNotes(await load(projectId));
        setStatus('ready');
      } catch {
        if (!quietly) setStatus('error');
      }
    },
    [projectId],
  );

  useEffect(() => {
    void reload();
  }, [reload]);
  const reloadVisibly = useCallback(() => reload(), [reload]);

  const createNote = useCallback(async (title = '', content = '', tags: string[] = [], folderId: number | null = null): Promise<Note> => {
    if (projectId === null) throw new Error('A new note needs a project');
    const note = await notesApi.create(projectId, { title, content, tags }, folderId);
    setNotes((current) => [note, ...current]);
    notifyNotesChanged();
    return note;
  }, [projectId]);

  /** `baseUpdatedAt`: the version the edit started from; changed elsewhere since, it fails with 409 (US-24). */
  const saveNote = useCallback(async (id: number, input: NoteInput, baseUpdatedAt?: string): Promise<Note> => {
    const saved = await notesApi.update(id, input, baseUpdatedAt);
    // Keep the local task and attachment lists: a save sent before a task was created or a file was uploaded
    // would otherwise drop them.
    setNotes((current) =>
      current.map((note) => (note.id === id ? { ...saved, tasks: note.tasks, attachments: note.attachments } : note)),
    );
    notifyNotesChanged();
    return saved;
  }, []);

  /** Into a folder (US-22), or (null) to the top level; with `toProjectId`, into another notebook (US-34). */
  const moveNote = useCallback(async (id: number, folderId: number | null, toProjectId?: number): Promise<void> => {
    const moved = await notesApi.moveToFolder(id, folderId, toProjectId);
    // A note that left this notebook leaves its list; "Alle Notizen" (null) keeps it in its new place.
    setNotes((current) =>
      projectId !== null && moved.projectId !== projectId ? current.filter((note) => note.id !== id) : current.map((note) => (note.id === id ? moved : note)),
    );
    if (toProjectId !== undefined) notifyNotesChanged();
  }, [projectId]);

  /** Puts the pages of a folder in an order of their own (US-34), at once and then on the server. */
  const reorderNotes = useCallback(
    async (folderId: number | null, ids: number[]): Promise<void> => {
      if (projectId === null) return;
      const place = new Map(ids.map((id, index) => [id, index]));
      setNotes((current) => current.map((note) => (place.has(note.id) ? { ...note, position: place.get(note.id)! } : note)));
      try {
        await notesApi.reorder(projectId, folderId, ids);
      } catch (error) {
        await reload(true);
        throw error;
      }
    },
    [projectId],
  );

  /** After a folder was deleted, its notes moved up a level: take the new places from the server. */
  const refreshFolders = useCallback(async (): Promise<void> => {
    try {
      const fresh = await load(projectId);
      const folderOf = new Map(fresh.map((note) => [note.id, note.folderId]));
      setNotes((current) => current.map((note) => ({ ...note, folderId: folderOf.get(note.id) ?? null })));
    } catch {
      // The old places stay until the next load.
    }
  }, [projectId]);

  const deleteNote = useCallback(async (id: number): Promise<void> => {
    await notesApi.remove(id);
    setNotes((current) => current.filter((note) => note.id !== id));
    notifyNotesChanged();
  }, []);

  /** `targetProjectId`: the task may go into another project (US-22), e.g. from a notebook. */
  const createTaskFromNote = useCallback(async (noteId: number, draft: TaskDraft, targetProjectId: number): Promise<Task> => {
    const task = await tasksApi.create(targetProjectId, { ...draft, sourceNoteId: noteId });
    // The server knows the column names; take the note's task list from there. Only the tasks change,
    // so an edit that is still being saved is not overwritten.
    const { tasks } = await notesApi.get(noteId);
    setNotes((current) => current.map((note) => (note.id === noteId ? { ...note, tasks } : note)));
    return task;
  }, []);

  // --- Changes made elsewhere (US-24) ----------------------------------------------------------------------------
  const notesRef = useRef(notes);
  useEffect(() => {
    notesRef.current = notes;
  });
  const [remoteEdits, setRemoteEdits] = useState<Record<number, RemoteEdit>>({});
  const editSeq = useRef(0);

  useRealtimeProject(projectId ?? 'all', async (events) => {
    const plan = planNotes(events, projectId === null);
    if (plan.remove.length) setNotes((current) => current.filter((note) => !plan.remove.includes(note.id)));
    if (plan.reload) await reload(true);
    else if (plan.folders) await refreshFolders();
    // In "Alle Notizen" only notes already listed: the others are in projects, which Wissen does not show.
    const known = new Set(notesRef.current.map((note) => note.id));
    const ids = projectId === null ? plan.refetch.filter((id) => known.has(id)) : plan.refetch;
    const fetched = await Promise.all(
      ids.map(async (id) => {
        try {
          return await notesApi.get(id);
        } catch (error) {
          if (error instanceof ApiError && error.status === 404) setNotes((current) => current.filter((note) => note.id !== id));
          return undefined;
        }
      }),
    );
    const fresh = fetched.filter((note) => note !== undefined);
    if (fresh.length === 0) return;
    setNotes((current) => {
      const byId = new Map(fresh.map((note) => [note.id, note]));
      const added = fresh.filter((note) => !current.some((c) => c.id === note.id));
      return [...added, ...current.map((note) => byId.get(note.id) ?? note)];
    });
    const edited = fresh.filter((note) => plan.edited.has(note.id));
    if (edited.length) {
      setRemoteEdits((current) => ({
        ...current,
        ...Object.fromEntries(edited.map((note) => [note.id, { seq: ++editSeq.current, by: plan.edited.get(note.id)! }])),
      }));
    }
  });

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

  return {
    notes,
    status,
    reload: reloadVisibly,
    /** Notes whose text was changed elsewhere, for the open editor (US-24). */
    remoteEdits,
    updateAttachments,
    createNote,
    saveNote,
    moveNote,
    reorderNotes,
    refreshFolders,
    deleteNote,
    createTaskFromNote,
    discardTask,
  };
}
