import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useProjects } from '../../hooks/useProjects';
import { paths } from '../../utils/paths';
import { FolderIcon } from '../icons';
import Button from '../ui/Button';
import ProjectDialog from './ProjectDialog';

/**
 * Someone without any notebook (US-21, US-26): just invited, or removed from all of them. They can start their own,
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
        <h1 className="mt-4 text-base font-semibold text-fg">Noch keine Notizbücher</h1>
        <p className="mt-1 text-sm text-fg-subtle">
          Lege ein eigenes Notizbuch an. Notizbücher anderer siehst du, sobald dich jemand dort als Mitglied hinzufügt.
        </p>
        <Button variant="primary" className="mt-5" onClick={() => setCreating(true)}>
          Neues Notizbuch
        </Button>
      </div>
      {creating && (
        <ProjectDialog
          mode="create"
          initial={{ name: '', color: 'indigo', icon: 'book', board: true }}
          onSubmit={async ({ board, ...values }) => {
            const project = await createProject({ ...values, kind: board ? 'project' : 'notebook' });
            navigate(paths.notes(project.id));
          }}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
