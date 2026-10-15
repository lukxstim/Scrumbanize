import NotesPage from './components/notes/NotesPage';

export default function App() {
  return (
    <div className="flex h-screen flex-col bg-slate-50 text-slate-900">
      <header className="flex h-12 shrink-0 items-center border-b border-slate-200 bg-white px-4">
        <span className="font-semibold tracking-tight">Scrumbanize</span>
      </header>
      <NotesPage />
    </div>
  );
}
