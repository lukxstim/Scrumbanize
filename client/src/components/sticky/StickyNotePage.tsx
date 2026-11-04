import { useParams } from 'react-router';
import StickyNote from './StickyNote';

/** /sticky/:noteId, the page of a sticky note window of the desktop app (US-26); closing closes the window. */
export default function StickyNotePage() {
  const noteId = Number(useParams().noteId);
  return <StickyNote noteId={noteId} onClose={() => window.close()} draggable />;
}
