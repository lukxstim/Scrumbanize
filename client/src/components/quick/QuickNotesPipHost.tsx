import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { quickNotesPip } from '../../utils/quickNotesWindow';
import QuickNotesPanel from './QuickNotesPanel';

/** Renders the quick notes of this tab's Picture-in-Picture window (US-26, Chrome and Edge) into that window. */
export default function QuickNotesPipHost() {
  const pip = useSyncExternalStore(quickNotesPip.subscribe, quickNotesPip.get);
  if (!pip) return null;
  return createPortal(<QuickNotesPanel onClose={() => pip.close()} inTab />, pip.document.body);
}
