import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Project, ProjectInput } from '../types/project';
import { projectsApi } from '../utils/api';
import { sortProjects } from '../utils/projects';
import type { LoadStatus } from './useNotes';

interface ProjectsState {
  /** Alphabetical. */
  projects: Project[];
  status: LoadStatus;
  /** Refreshes the list, e.g. for current note and task counts. */
  reload: () => Promise<void>;
  createProject: (input: ProjectInput) => Promise<Project>;
  updateProject: (id: number, patch: Partial<ProjectInput>) => Promise<Project>;
  deleteProject: (id: number) => Promise<void>;
}

const ProjectsContext = createContext<ProjectsState | null>(null);

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');

  const reload = useCallback(async () => {
    try {
      setProjects(sortProjects(await projectsApi.list()));
      setStatus('ready');
    } catch {
      // Keep showing a list that was already loaded; only the first load can fail visibly.
      setStatus((current) => (current === 'ready' ? current : 'error'));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const createProject = useCallback(async (input: ProjectInput) => {
    const project = await projectsApi.create(input);
    setProjects((current) => sortProjects([...current, project]));
    return project;
  }, []);

  const updateProject = useCallback(async (id: number, patch: Partial<ProjectInput>) => {
    const project = await projectsApi.update(id, patch);
    setProjects((current) => sortProjects(current.map((p) => (p.id === id ? project : p))));
    return project;
  }, []);

  const deleteProject = useCallback(async (id: number) => {
    await projectsApi.remove(id);
    setProjects((current) => current.filter((p) => p.id !== id));
  }, []);

  const value = useMemo(
    () => ({ projects, status, reload, createProject, updateProject, deleteProject }),
    [projects, status, reload, createProject, updateProject, deleteProject],
  );

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects(): ProjectsState {
  const context = useContext(ProjectsContext);
  if (!context) throw new Error('useProjects must be used inside <ProjectsProvider>');
  return context;
}
