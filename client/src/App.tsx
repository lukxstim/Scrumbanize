import { Navigate, NavLink, Route, Routes, useMatch } from 'react-router';
import BoardPage from './components/board/BoardPage';
import NotesPage from './components/notes/NotesPage';
import ProjectLayout from './components/projects/ProjectLayout';
import ProjectSwitcher from './components/projects/ProjectSwitcher';
import RedirectToProject from './components/projects/RedirectToProject';
import { useProjects } from './hooks/useProjects';
import { paths } from './utils/paths';

const tabClass = (active: boolean) =>
  `rounded-md px-3 py-1.5 text-sm font-medium ${active ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-900'}`;

export default function App() {
  const { projects } = useProjects();
  const projectMatch = useMatch('/p/:projectId/*');
  const activeProject = projects.find((p) => p.id === Number(projectMatch?.params.projectId));
  // A task's details are shown on the board, so the Board tab stays active there.
  const boardMatch = useMatch('/p/:projectId/board');
  const taskMatch = useMatch('/p/:projectId/tasks/:taskId');
  const onBoard = boardMatch !== null || taskMatch !== null;

  return (
    <div className="flex h-screen flex-col bg-slate-50 text-slate-900">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4">
        <span className="font-semibold tracking-tight">Scrumbanize</span>
        {activeProject && (
          <>
            <span className="text-slate-300" aria-hidden="true">
              /
            </span>
            <ProjectSwitcher active={activeProject} section={onBoard ? 'board' : 'notes'} />
            <nav className="ml-3 flex gap-1" aria-label="Hauptnavigation">
              <NavLink to={paths.notes(activeProject.id)} className={({ isActive }) => tabClass(isActive)}>
                Notizen
              </NavLink>
              <NavLink to={paths.board(activeProject.id)} className={() => tabClass(onBoard)}>
                Board
              </NavLink>
            </nav>
          </>
        )}
      </header>

      <Routes>
        <Route path="/p/:projectId" element={<ProjectLayout />}>
          <Route index element={<Navigate to="notes" replace />} />
          <Route path="notes/:noteId?" element={<NotesPage />} />
          {/* One BoardPage instance for both paths, so opening a task does not reload the board. */}
          <Route element={<BoardPage />}>
            <Route path="board" element={null} />
            <Route path="tasks/:taskId" element={null} />
          </Route>
        </Route>
        {/* Addresses from before projects existed, and anything unknown, open the last project. */}
        <Route path="/board" element={<RedirectToProject section="board" />} />
        <Route path="*" element={<RedirectToProject />} />
      </Routes>
    </div>
  );
}
