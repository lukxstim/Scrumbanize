import { useCallback, useEffect, useState } from 'react';
import type { Note, NoteInput } from '../types/note';
import { notesApi } from '../utils/api';

export type LoadStatus = 'loading' | 'ready' | 'error';

/** Loads all notes once and keeps the local list in sync with every successful API call. */
export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');

  const reload = useCallback(async () => {
    setStatus('loading');
    try {
      setNotes(await notesApi.list());
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const createNote = useCallback(async (): Promise<Note> => {
    const note = await notesApi.create({ title: '', content: '', tags: [] });
    setNotes((current) => [note, ...current]);
    return note;
  }, []);

  const saveNote = useCallback(async (id: number, input: NoteInput): Promise<void> => {
    const saved = await notesApi.update(id, input);
    setNotes((current) => current.map((note) => (note.id === id ? saved : note)));
  }, []);

  const deleteNote = useCallback(async (id: number): Promise<void> => {
    await notesApi.remove(id);
    setNotes((current) => current.filter((note) => note.id !== id));
  }, []);

  return { notes, status, reload, createNote, saveNote, deleteNote };
}
