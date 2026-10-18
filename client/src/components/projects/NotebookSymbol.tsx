import type { ReactNode, SVGProps } from 'react';
import type { NotebookIcon, ProjectColor } from '../../types/project';

/** German names of the notebook symbols, for the picker and screen readers. */
export const NOTEBOOK_ICON_LABELS: Record<NotebookIcon, string> = {
  book: 'Buch',
  briefcase: 'Arbeit',
  graduation: 'Studium',
  house: 'Zuhause',
  heart: 'Herz',
  star: 'Stern',
  lightbulb: 'Idee',
  code: 'Code',
  music: 'Musik',
  plane: 'Reisen',
  utensils: 'Essen',
  leaf: 'Natur',
  dumbbell: 'Sport',
  camera: 'Fotos',
  wallet: 'Finanzen',
  users: 'Familie & Freunde',
};

/** 16px outline drawings, like the icons in components/icons.tsx. */
const PATHS: Record<NotebookIcon, ReactNode> = {
  book: <path d="M3 3.5A1.5 1.5 0 0 1 4.5 2H13v10H4.5A1.5 1.5 0 0 0 3 13.5zM3 13.5A1.5 1.5 0 0 0 4.5 15H13v-3M6 5h4" />,
  briefcase: (
    <>
      <rect x="2" y="4.5" width="12" height="9" rx="1.5" />
      <path d="M5.5 4.5V3.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1M2 8.5h12" />
    </>
  ),
  graduation: <path d="M1.5 6 8 3l6.5 3L8 9zM4 7.2v3.3c0 1 1.8 2 4 2s4-1 4-2V7.2M14.5 6v4" />,
  house: <path d="M2.5 7.5 8 2.5l5.5 5M4 6.5v7h3v-4h2v4h3v-7" />,
  heart: <path d="M8 13.5S2 10 2 6a3 3 0 0 1 6-1 3 3 0 0 1 6 1c0 4-6 7.5-6 7.5z" />,
  star: <path d="m8 2 1.8 3.8 4.2.5-3.1 2.9.8 4.1L8 11.3l-3.7 2 .8-4.1L2 6.3l4.2-.5z" />,
  lightbulb: <path d="M6 12.5h4M6.5 14.5h3M5.5 10.5c-1.2-.9-2-2.3-2-3.9a4.5 4.5 0 0 1 9 0c0 1.6-.8 3-2 3.9v.5h-5z" />,
  code: <path d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5M9 3 7 13" />,
  music: (
    <>
      <path d="M6 12V3.5l7-1.5v8.5" />
      <circle cx="4.5" cy="12" r="1.5" />
      <circle cx="11.5" cy="10.5" r="1.5" />
    </>
  ),
  plane: <path d="M14 2 2 7l4.5 1.5M14 2l-3 12-4.5-5.5M14 2 6.5 8.5V13l2-2" />,
  utensils: <path d="M4 2v4a1.5 1.5 0 0 0 3 0V2M5.5 2v12M11.5 14V2c-1.5 1-2.5 3-2.5 5.5h2.5" />,
  leaf: <path d="M3 13C3 7 7 3 13.5 2.5 13 9 9 13 3 13zM3 13l6-6" />,
  dumbbell: <path d="M1.5 8h13M4 5v6M12 5v6M2.5 6.5v3M13.5 6.5v3" />,
  camera: (
    <>
      <path d="M2 5.5A1.5 1.5 0 0 1 3.5 4h1.5l1-1.5h4l1 1.5h1.5A1.5 1.5 0 0 1 14 5.5v6a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z" />
      <circle cx="8" cy="8.5" r="2.25" />
    </>
  ),
  wallet: (
    <>
      <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3H12v2.5M2 4.5v7A1.5 1.5 0 0 0 3.5 13H14V5.5H3.5A1.5 1.5 0 0 1 2 4.5z" />
      <circle cx="11" cy="9.25" r=".75" fill="currentColor" />
    </>
  ),
  users: (
    <>
      <circle cx="6" cy="5.5" r="2.25" />
      <path d="M1.5 13.5a4.5 4.5 0 0 1 9 0M10.5 3.5a2.25 2.25 0 0 1 0 4.25M12 9.5a4.5 4.5 0 0 1 2.5 4" />
    </>
  ),
};

export function NotebookGlyph({ icon, ...props }: { icon: NotebookIcon } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-4"
      {...props}
    >
      {PATHS[icon]}
    </svg>
  );
}

/** Tile colors per notebook color: a soft background with a strong symbol. */
const TILE: Record<ProjectColor, string> = {
  slate: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',
  red: 'bg-red-500/15 text-red-600 dark:text-red-300',
  amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  emerald: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  sky: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  indigo: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300',
  violet: 'bg-violet-500/15 text-violet-600 dark:text-violet-300',
  pink: 'bg-pink-500/15 text-pink-600 dark:text-pink-300',
};

/** A notebook's symbol on a tile in its color; `size` sm for menus and the header, lg for the overview. */
export default function NotebookSymbol({ icon, color, size = 'sm' }: { icon: NotebookIcon | null; color: ProjectColor; size?: 'sm' | 'lg' }) {
  return (
    <span className={`grid shrink-0 place-items-center ${size === 'lg' ? 'size-10 rounded-lg' : 'size-5 rounded'} ${TILE[color]}`} aria-hidden="true">
      <NotebookGlyph icon={icon ?? 'book'} className={size === 'lg' ? 'size-5' : 'size-3.5'} />
    </span>
  );
}
