import { useNavigate } from 'react-router';
import { paths } from '../../utils/paths';
import { GraphIcon, ListIcon } from '../icons';
import SegmentedControl from '../ui/SegmentedControl';

/** "Liste | Graph" at the top of the notes area; both views live at their own address. */
/** `compact`: icons only (names in the tooltip), for the narrow notes sidebar. */
export default function NotesViewSwitch({ projectId, view, compact = false }: { projectId: number; view: 'list' | 'graph'; compact?: boolean }) {
  const navigate = useNavigate();
  return (
    <SegmentedControl
      label="Ansicht der Notizen"
      size="sm"
      value={view}
      onChange={(next) => navigate(next === 'graph' ? paths.graph(projectId) : paths.notes(projectId))}
      options={[
        { value: 'list', label: 'Liste', icon: <ListIcon className="size-3.5" />, iconOnly: compact },
        { value: 'graph', label: 'Graph', icon: <GraphIcon className="size-3.5" />, iconOnly: compact },
      ]}
    />
  );
}
