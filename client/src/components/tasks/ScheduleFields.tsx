import { useId } from 'react';
import type { TaskPriority } from '../../types/task';
import { formatDateLong, quickDates, todayIso } from '../../utils/dates';
import { PRIORITIES_DESC, PRIORITY_LABELS, PRIORITY_STYLES } from '../../utils/priority';
import { adjustSchedule, type Schedule } from '../../utils/schedule';
import SegmentedControl from '../ui/SegmentedControl';
import { fieldClass, labelClass } from '../ui/styles';

export function PriorityPicker({ value, onChange }: { value: TaskPriority | null; onChange: (value: TaskPriority | null) => void }) {
  return (
    <SegmentedControl
      label="Priorität"
      size="sm"
      value={value ?? 'none'}
      onChange={(next) => onChange(next === 'none' ? null : next)}
      options={[
        { value: 'none', label: 'Keine' },
        ...PRIORITIES_DESC.map((priority) => ({
          value: priority,
          label: PRIORITY_LABELS[priority],
          icon: <span aria-hidden="true" className={`size-2 rounded-full ${PRIORITY_STYLES[priority].dot}`} />,
        })),
      ]}
    />
  );
}

interface DateFieldProps {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  /** Quick buttons (Heute, Morgen, Nächste Woche); "Entfernen" is shown whenever there is a value. */
  quick?: boolean;
  disabled?: boolean;
  disabledHint?: string;
}

/** A native date input with German quick buttons. */
export function DateField({ label, value, onChange, quick = true, disabled = false, disabledHint }: DateFieldProps) {
  const id = useId();
  const dates = quickDates(todayIso());
  const quickButton = (text: string, date: string) => (
    <button
      type="button"
      onClick={() => onChange(date)}
      title={formatDateLong(date)}
      aria-pressed={value === date}
      className={`rounded px-1.5 py-0.5 text-xs font-medium transition-colors ${
        value === date ? 'bg-accent-muted text-accent-text' : 'text-fg-subtle hover:bg-surface-hover hover:text-fg'
      }`}
    >
      {text}
    </button>
  );

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        type="date"
        value={value ?? ''}
        disabled={disabled}
        title={disabled ? disabledHint : undefined}
        onChange={(event) => onChange(event.target.value || null)}
        className={`!w-40 !py-1 ${fieldClass} disabled:opacity-50`}
      />
      {!disabled && (
        <div className="flex flex-wrap gap-0.5">
          {quick && quickButton('Heute', dates.today)}
          {quick && quickButton('Morgen', dates.tomorrow)}
          {quick && quickButton('Nächste Woche', dates.nextWeek)}
          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="rounded px-1.5 py-0.5 text-xs font-medium text-fg-subtle hover:bg-danger-muted hover:text-danger-text"
            >
              Entfernen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Priority, start and due date in one block, for the task details and the convert dialog. */
export default function ScheduleFields({ value, onChange }: { value: Schedule; onChange: (next: Schedule) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className={labelClass}>Priorität</span>
        <div>
          <PriorityPicker value={value.priority} onChange={(priority) => onChange({ ...value, priority })} />
        </div>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <DateField label="Fällig" value={value.dueDate} onChange={(dueDate) => onChange(adjustSchedule(value, { dueDate }))} />
        <DateField
          label="Start (optional)"
          value={value.startDate}
          quick={false}
          onChange={(startDate) => onChange(adjustSchedule(value, { startDate }))}
        />
      </div>
    </div>
  );
}
