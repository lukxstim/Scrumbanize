import { Link } from 'react-router';
import type { LinkedTask } from '../../types/task';
import { paths } from '../../utils/paths';

/** Tasks share their note's project. */
export default function LinkedTasks({ projectId, tasks }: { projectId: number; tasks: LinkedTask[] }) {
  if (tasks.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-fg-subtle">Tasks:</span>
      {tasks.map((task) => (
        <Link
          key={task.id}
          to={paths.task(projectId, task.id)}
          title="Task auf dem Board öffnen"
          className="flex max-w-72 items-center gap-1.5 rounded border border-success-line bg-success-muted px-1.5 py-0.5 text-xs text-success-text transition-[filter] duration-150 hover:brightness-95 dark:hover:brightness-125"
        >
          <span className="font-mono text-success-text">#{task.id}</span>
          <span className="truncate">{task.title}</span>
          <span className="shrink-0 text-success-text">· {task.column.name}</span>
        </Link>
      ))}
    </div>
  );
}
