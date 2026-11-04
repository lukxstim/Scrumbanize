import { flushPendingSaves } from '../../hooks/useAutosave';
import QuickNotesPanel from './QuickNotesPanel';

/**
 * /kurznotizen, the page of the desktop app's quick notes panel (US-26); closing closes the window. What is still
 * being typed is saved first, so the page does not refuse to close.
 */
export default function QuickNotesPage() {
  return <QuickNotesPanel onClose={() => void flushPendingSaves().then(() => window.close())} />;
}
