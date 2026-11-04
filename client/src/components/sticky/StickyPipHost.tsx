import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { pipSticky } from '../../utils/stickyNotes';
import StickyNote from './StickyNote';

/** Renders the sticky note of this tab's Picture-in-Picture window (US-26, Chrome and Edge) into that window. */
export default function StickyPipHost() {
  const pip = useSyncExternalStore(pipSticky.subscribe, pipSticky.get);
  if (!pip) return null;
  return createPortal(<StickyNote key={pip.noteId} noteId={pip.noteId} onClose={() => pip.window.close()} inTab />, pip.window.document.body);
}
