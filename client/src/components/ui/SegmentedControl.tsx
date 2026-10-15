import type { ReactNode } from 'react';

interface SegmentedControlProps<T extends string> {
  /** Accessible name of the group, e.g. "Ansicht". */
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; icon?: ReactNode; iconOnly?: boolean }[];
  size?: 'sm' | 'md';
}

/** A small group of toggle buttons where exactly one is active (view mode, theme). */
export default function SegmentedControl<T extends string>({ label, value, onChange, options, size = 'md' }: SegmentedControlProps<T>) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg bg-surface-muted p-0.5 ring-1 ring-line ring-inset">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            aria-label={option.iconOnly ? option.label : undefined}
            title={option.iconOnly ? option.label : undefined}
            onClick={() => onChange(option.value)}
            className={`flex items-center gap-1.5 rounded-md font-medium transition-[color,background-color,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-accent ${
              size === 'sm' ? 'h-6 px-2 text-xs' : 'h-7 px-2.5 text-sm'
            } ${option.iconOnly ? '!px-1.5' : ''} ${
              active ? 'bg-surface text-fg shadow-card' : 'text-fg-subtle hover:text-fg'
            }`}
          >
            {option.icon}
            {!option.iconOnly && option.label}
          </button>
        );
      })}
    </div>
  );
}
