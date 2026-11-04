import QuickNotesPanel from './QuickNotesPanel';

/** /kurznotizen, the page of the desktop app's quick notes panel (US-26); closing closes the window. */
export default function QuickNotesPage() {
  return <QuickNotesPanel onClose={() => window.close()} />;
}
