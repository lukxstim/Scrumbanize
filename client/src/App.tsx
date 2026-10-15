import { Navigate, NavLink, Route, Routes, useMatch } from 'react-router';
import BoardPage from './components/board/BoardPage';
import NotesPage from './components/notes/NotesPage';

const tabClass = (active: boolean) =>
  `rounded-md px-3 py-1.5 text-sm font-medium ${active ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-900'}`;

export default function App() {
  // A task's details are shown on the board, so the Board tab stays active there.
  const onTaskPage = useMatch('/tasks/:taskId') !== null;

  return (
    <div className="flex h-screen flex-col bg-slate-50 text-slate-900">
      <header className="flex h-12 shrink-0 items-center gap-6 border-b border-slate-200 bg-white px-4">
        <span className="font-semibold tracking-tight">Scrumbanize</span>
        <nav className="flex gap-1" aria-label="Hauptnavigation">
          <NavLink to="/notes" className={({ isActive }) => tabClass(isActive)}>
            Notizen
          </NavLink>
          <NavLink to="/board" className={({ isActive }) => tabClass(isActive || onTaskPage)}>
            Board
          </NavLink>
        </nav>
      </header>

      <Routes>
        <Route path="/notes/:noteId?" element={<NotesPage />} />
        {/* One BoardPage instance for both paths, so opening a task does not reload the board. */}
        <Route element={<BoardPage />}>
          <Route path="/board" element={null} />
          <Route path="/tasks/:taskId" element={null} />
        </Route>
        <Route path="*" element={<Navigate to="/notes" replace />} />
      </Routes>
    </div>
  );
}
