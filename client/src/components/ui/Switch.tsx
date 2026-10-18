import { useId, type ReactNode } from 'react';

interface SwitchProps {
  label: string;
  description?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** An on/off setting: label and description on the left, the switch on the right. */
export default function Switch({ label, description, checked, onChange, disabled = false }: SwitchProps) {
  const id = useId();
  return (
    <div className={`flex items-start justify-between gap-4 ${disabled ? 'opacity-60' : ''}`}>
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {label}
        </label>
        {description && (
          <p id={`${id}-description`} className="mt-0.5 text-xs text-fg-subtle">
            {description}
          </p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-description` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed ${
          checked ? 'bg-accent' : 'bg-surface-muted ring-1 ring-line-strong ring-inset'
        }`}
      >
        <span
          className={`inline-block size-4 rounded-full bg-white shadow-sm transition-transform duration-150 ${checked ? 'translate-x-4.5' : 'translate-x-0.5'}`}
        />
      </button>
    </div>
  );
}
