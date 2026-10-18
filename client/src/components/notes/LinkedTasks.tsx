import { Link } from 'react-router';
import { useProjects } from '../../hooks/useProjects';
import type { LinkedTask } from '../../types/task';
import { paths } from '../../utils/paths';

/** Tasks created from the note; they may live in other projects (US-22), which are named, or be out of reach. */
export default function LinkedTasks({ projectId, tasks }: { projectId: number; tasks: LinkedTask[] }) {
  const { projects } = useProjects();
  if (tasks.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-fg-subtle">Tasks:</span>
      {tasks.map((task) =>
        task.restricted ? (
          <span
            key={task.id}
            title="Dieser Task liegt in einem Projekt, auf das du keinen Zugriff hast."
            className="flex items-center gap-1.5 rounded border border-line bg-surface-muted px-1.5 py-0.5 text-xs text-fg-subtle"
          >
            <span className="font-mono">#{task.id}</span>
            Kein Zugriff
          </span>
        ) : (
          <Link
            key={task.id}
            to={paths.task(task.projectId, task.id)}
            title="Task auf dem Board öffnen"
            className="flex max-w-80 items-center gap-1.5 rounded border border-success-line bg-success-muted px-1.5 py-0.5 text-xs text-success-text transition-[filter] duration-150 hover:brightness-95 dark:hover:brightness-125"
          >
            <span className="font-mono text-success-text">#{task.id}</span>
            <span className="truncate">{task.title}</span>
            <span className="shrink-0 text-success-text">
              · {task.column.name}
              {task.projectId !== projectId && ` · ${projects.find((p) => p.id === task.projectId)?.name ?? 'anderes Projekt'}`}
            </span>
          </Link>
        ),
      )}
    </div>
  );
}
