import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useProjects } from '../../hooks/useProjects';
import { paths } from '../../utils/paths';
import { FolderIcon } from '../icons';
import Button from '../ui/Button';
import ProjectDialog from './ProjectDialog';

/**
 * Someone without any project (US-21): just invited, or removed from all of them. They can start their own project,
 * or wait until an owner adds them to one.
 */
export default function NoProjects() {
  const { createProject } = useProjects();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-surface-muted text-fg-subtle ring-1 ring-line [&_svg]:size-6">
          <FolderIcon />
        </span>
        <h1 className="mt-4 text-base font-semibold text-fg">Noch keine Projekte</h1>
        <p className="mt-1 text-sm text-fg-subtle">
          Lege ein eigenes Projekt an. Projekte anderer siehst du, sobald dich jemand dort als Mitglied hinzufügt.
        </p>
        <Button variant="primary" className="mt-5" onClick={() => setCreating(true)}>
          Neues Projekt
        </Button>
      </div>
      {creating && (
        <ProjectDialog
          mode="create"
          initial={{ name: '', color: 'indigo' }}
          onSubmit={async (input) => {
            const project = await createProject(input);
            navigate(paths.notes(project.id));
          }}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
