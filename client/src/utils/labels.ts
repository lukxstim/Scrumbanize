import type { ProjectColor } from '../types/project';
import type { Label } from '../types/task';

/**
 * Chip and dot of a label color. The text stays in the text color (readable in both themes, on any tint); the color
 * shows in the dot and a light tint, so the name, not the hue, carries the meaning.
 */
export const LABEL_STYLES: Record<ProjectColor, { chip: string; dot: string }> = {
  slate: { chip: 'bg-slate-500/12 ring-slate-500/30', dot: 'bg-slate-500' },
  red: { chip: 'bg-red-500/12 ring-red-500/30', dot: 'bg-red-500' },
  amber: { chip: 'bg-amber-500/14 ring-amber-500/35', dot: 'bg-amber-500' },
  emerald: { chip: 'bg-emerald-500/12 ring-emerald-500/30', dot: 'bg-emerald-500' },
  sky: { chip: 'bg-sky-500/12 ring-sky-500/30', dot: 'bg-sky-500' },
  indigo: { chip: 'bg-indigo-500/12 ring-indigo-500/30', dot: 'bg-indigo-500' },
  violet: { chip: 'bg-violet-500/12 ring-violet-500/30', dot: 'bg-violet-500' },
  pink: { chip: 'bg-pink-500/12 ring-pink-500/30', dot: 'bg-pink-500' },
};

/** The same colors as values, for canvas drawing (graph). Tailwind's 500 steps. */
export const LABEL_HEX: Record<ProjectColor, string> = {
  slate: '#62748e',
  red: '#fb2c36',
  amber: '#fe9a00',
  emerald: '#00bc7d',
  sky: '#00a6f4',
  indigo: '#615fff',
  violet: '#8e51ff',
  pink: '#f6339a',
};

const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase('de') === b.trim().toLocaleLowerCase('de');

/** The project's labels with these names (case-insensitive), and the names that have none. */
export function matchLabels(names: string[], labels: Label[]): { found: Label[]; missing: string[] } {
  const found: Label[] = [];
  const missing: string[] = [];
  for (const name of names) {
    const label = labels.find((l) => sameName(l.name, name));
    if (label) {
      if (!found.includes(label)) found.push(label);
    } else missing.push(name);
  }
  return { found, missing };
}

export const findByName = <T extends { name: string }>(items: T[], name: string | null): T | undefined =>
  name === null ? undefined : items.find((item) => sameName(item.name, name));

/** "Bug, Feature" for a tooltip or screen reader. */
export const labelList = (labels: Label[]) => labels.map((l) => l.name).join(', ');
