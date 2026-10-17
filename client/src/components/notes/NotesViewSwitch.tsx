import { useNavigate } from 'react-router';
import { paths } from '../../utils/paths';
import { GraphIcon, ListIcon } from '../icons';
import SegmentedControl from '../ui/SegmentedControl';

/** "Liste | Graph" at the top of the notes area; both views live at their own address. */
export default function NotesViewSwitch({ projectId, view }: { projectId: number; view: 'list' | 'graph' }) {
  const navigate = useNavigate();
  return (
    <SegmentedControl
      label="Ansicht der Notizen"
      size="sm"
      value={view}
      onChange={(next) => navigate(next === 'graph' ? paths.graph(projectId) : paths.notes(projectId))}
      options={[
        { value: 'list', label: 'Liste', icon: <ListIcon className="size-3.5" /> },
        { value: 'graph', label: 'Graph', icon: <GraphIcon className="size-3.5" /> },
      ]}
    />
  );
}
