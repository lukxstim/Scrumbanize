import { Link } from 'react-router';
import type { LinkedTask } from '../../types/task';
import { paths } from '../../utils/paths';
import { TASK_STATUS_LABELS } from '../../utils/taskStatus';

/** Tasks share their note's project. */
export default function LinkedTasks({ projectId, tasks }: { projectId: number; tasks: LinkedTask[] }) {
  if (tasks.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-slate-500">Tasks:</span>
      {tasks.map((task) => (
        <Link
          key={task.id}
          to={paths.task(projectId, task.id)}
          title="Task auf dem Board öffnen"
          className="flex max-w-72 items-center gap-1.5 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-800 hover:border-emerald-400 hover:bg-emerald-100"
        >
          <span className="font-mono text-emerald-600">#{task.id}</span>
          <span className="truncate">{task.title}</span>
          <span className="shrink-0 text-emerald-600">· {TASK_STATUS_LABELS[task.status]}</span>
        </Link>
      ))}
    </div>
  );
}
