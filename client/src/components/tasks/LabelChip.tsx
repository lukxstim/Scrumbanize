import type { ProjectColor } from '../../types/project';
import type { Label } from '../../types/task';
import { LABEL_STYLES, labelList } from '../../utils/labels';
import { PROJECT_COLORS } from '../../utils/projects';

/** A label as a chip: colored dot and tint, the name in the text color. */
export function LabelChip({ label }: { label: Label }) {
  const style = LABEL_STYLES[label.color];
  return (
    <span className={`inline-flex max-w-full items-center gap-1 rounded px-1.5 py-px text-[11px] font-medium text-fg ring-1 ring-inset ${style.chip}`}>
      <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${style.dot}`} />
      <span className="truncate">{label.name}</span>
    </span>
  );
}

/** At most `max` chips, then "+n". */
export function LabelChips({ labels, max = 3 }: { labels: Label[]; max?: number }) {
  if (labels.length === 0) return null;
  return (
    <>
      {labels.slice(0, max).map((label) => (
        <LabelChip key={label.id} label={label} />
      ))}
      {labels.length > max && (
        <span className="rounded bg-surface-muted px-1.5 py-px text-[11px] text-fg-subtle ring-1 ring-line ring-inset" title={labelList(labels.slice(max))}>
          +{labels.length - max}
        </span>
      )}
    </>
  );
}

/** Only the colors, for tight spots (compact cards, calendar); the names are in the tooltip and for screen readers. */
export function LabelDots({ labels, className = '' }: { labels: Label[]; className?: string }) {
  if (labels.length === 0) return null;
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} title={`Labels: ${labelList(labels)}`}>
      {labels.slice(0, 4).map((label) => (
        <span key={label.id} aria-hidden="true" className={`size-1.5 rounded-full ${LABEL_STYLES[label.color].dot}`} />
      ))}
      <span className="sr-only">Labels: {labelList(labels)}</span>
    </span>
  );
}

/** The eight colors as round buttons, like the project colors. */
export function ColorChoice({ value, onChange, label }: { value: ProjectColor; onChange: (color: ProjectColor) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
      {PROJECT_COLORS.map((color) => (
        <button
          key={color.value}
          type="button"
          role="radio"
          aria-checked={value === color.value}
          aria-label={color.label}
          title={color.label}
          onClick={() => onChange(color.value)}
          className={`grid size-5 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-accent ${
            value === color.value ? 'ring-2 ring-fg ring-offset-1 ring-offset-surface' : ''
          }`}
        >
          <span className={`size-3.5 rounded-full ${color.dot}`} />
        </button>
      ))}
    </div>
  );
}
