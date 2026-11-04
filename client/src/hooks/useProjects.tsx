import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Project, ProjectInput, ProjectPatch } from '../types/project';
import { metaApi, projectsApi, type DesktopInfo } from '../utils/api';
import { sortProjects } from '../utils/projects';
import type { LoadStatus } from './useNotes';
import { useRealtimeSignal } from './useRealtime';

interface ProjectsState {
  /** Alphabetical. */
  projects: Project[];
  status: LoadStatus;
  /** The sample project of the first start, opened when this browser has no last project yet. */
  sampleProjectId: number | null;
  /** Version and release page, inside the desktop app only. */
  desktop: DesktopInfo | null;
  /** Refreshes the list, e.g. for current note and task counts. */
  reload: () => Promise<void>;
  createProject: (input: ProjectInput) => Promise<Project>;
  updateProject: (id: number, patch: ProjectPatch) => Promise<Project>;
  deleteProject: (id: number) => Promise<void>;
}

const ProjectsContext = createContext<ProjectsState | null>(null);

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [sampleProjectId, setSampleProjectId] = useState<number | null>(null);
  const [desktop, setDesktop] = useState<DesktopInfo | null>(null);

  const reload = useCallback(async () => {
    try {
      const [list, meta] = await Promise.all([projectsApi.list(), metaApi.get()]);
      setProjects(sortProjects(list));
      setSampleProjectId(meta.sampleProjectId);
      setDesktop(meta.desktop);
      setStatus('ready');
    } catch {
      // Keep showing a list that was already loaded; only the first load can fail visibly.
      setStatus((current) => (current === 'ready' ? current : 'error'));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Projects renamed, deleted, restored or shared elsewhere, or the user's memberships changed (US-24).
  useRealtimeSignal((signal) => {
    if (signal.type === 'projects' || signal.type === 'resync' || signal.type.startsWith('project.') || signal.type === 'members.changed') {
      void reload();
    }
  });

  const createProject = useCallback(async (input: ProjectInput) => {
    const project = await projectsApi.create(input);
    setProjects((current) => sortProjects([...current, project]));
    return project;
  }, []);

  const updateProject = useCallback(async (id: number, patch: ProjectPatch) => {
    const project = await projectsApi.update(id, patch);
    setProjects((current) => sortProjects(current.map((p) => (p.id === id ? project : p))));
    return project;
  }, []);

  const deleteProject = useCallback(async (id: number) => {
    await projectsApi.remove(id);
    setProjects((current) => current.filter((p) => p.id !== id));
  }, []);

  const value = useMemo(
    () => ({ projects, status, sampleProjectId, desktop, reload, createProject, updateProject, deleteProject }),
    [projects, status, sampleProjectId, desktop, reload, createProject, updateProject, deleteProject],
  );

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects(): ProjectsState {
  const context = useContext(ProjectsContext);
  if (!context) throw new Error('useProjects must be used inside <ProjectsProvider>');
  return context;
}
