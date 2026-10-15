import type { LinkedTask } from '../../types/task';
import { TASK_STATUS_LABELS } from '../../utils/taskStatus';

export default function LinkedTasks({ tasks }: { tasks: LinkedTask[] }) {
  if (tasks.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-slate-500">Tasks:</span>
      {tasks.map((task) => (
        <span
          key={task.id}
          className="flex max-w-72 items-center gap-1.5 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-800"
        >
          <span className="font-mono text-emerald-600">#{task.id}</span>
          <span className="truncate">{task.title}</span>
          <span className="shrink-0 text-emerald-600">· {TASK_STATUS_LABELS[task.status]}</span>
        </span>
      ))}
    </div>
  );
}
