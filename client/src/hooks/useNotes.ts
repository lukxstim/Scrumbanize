import { useCallback, useEffect, useState } from 'react';
import type { Note, NoteInput } from '../types/note';
import type { Task } from '../types/task';
import { notesApi, tasksApi } from '../utils/api';
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

  const createNote = useCallback(async (): Promise<Note> => {
    const note = await notesApi.create(projectId, { title: '', content: '', tags: [] });
    setNotes((current) => [note, ...current]);
    return note;
  }, [projectId]);

  const saveNote = useCallback(async (id: number, input: NoteInput): Promise<void> => {
    const saved = await notesApi.update(id, input);
    // Keep the local task list: a save that was sent before a task was created would otherwise drop it.
    setNotes((current) => current.map((note) => (note.id === id ? { ...saved, tasks: note.tasks } : note)));
  }, []);

  const deleteNote = useCallback(async (id: number): Promise<void> => {
    await notesApi.remove(id);
    setNotes((current) => current.filter((note) => note.id !== id));
  }, []);

  const createTaskFromNote = useCallback(async (noteId: number, draft: TaskDraft): Promise<Task> => {
    const task = await tasksApi.create(projectId, { ...draft, sourceNoteId: noteId });
    // The server knows the column names; take the note's task list from there. Only the tasks change,
    // so an edit that is still being saved is not overwritten.
    const { tasks } = await notesApi.get(noteId);
    setNotes((current) => current.map((note) => (note.id === noteId ? { ...note, tasks } : note)));
    return task;
  }, [projectId]);

  const deleteTask = useCallback(async (taskId: number): Promise<void> => {
    await tasksApi.remove(taskId);
    setNotes((current) =>
      current.map((note) =>
        note.tasks.some((t) => t.id === taskId) ? { ...note, tasks: note.tasks.filter((t) => t.id !== taskId) } : note,
      ),
    );
  }, []);

  return { notes, status, reload, createNote, saveNote, deleteNote, createTaskFromNote, deleteTask };
}
