import { useCallback, useEffect, useRef, useState } from 'react';
import type { NoteTemplate, TaskTemplate, Template } from '../types/template';
import { templatesApi } from '../utils/api';
import { sortTemplates } from '../utils/templates';

/**
 * The templates a project can use (its own and those for all projects), own ones first. Reloads when the window
 * regains focus, so a template made in another window shows up.
 */
export function useTemplates(projectId: number | undefined) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    if (projectId === undefined) {
      setTemplates([]);
      return;
    }
    try {
      const list = await templatesApi.list(projectId);
      if (id === requestId.current) setTemplates(sortTemplates(list));
    } catch {
      // Without templates, notes and tasks are simply created empty.
    }
  }, [projectId]);

  useEffect(() => {
    void reload();
    const onFocus = () => void reload();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reload]);

  return {
    templates,
    noteTemplates: templates.filter((t): t is NoteTemplate => t.kind === 'note'),
    taskTemplates: templates.filter((t): t is TaskTemplate => t.kind === 'task'),
    reload,
  };
}
