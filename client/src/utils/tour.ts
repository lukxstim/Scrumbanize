/** One step of the onboarding tour; `target` is the `data-tour` value of the element it points at. */
export interface TourStep {
  /** Undefined: shown in the middle of the window. */
  target?: string;
  title: string;
  text: string;
}

/** Everything sits in the header, so the tour works on every page without switching pages. */
export const TOUR_STEPS: TourStep[] = [
  {
    title: 'Willkommen bei Scrumbanize',
    text: 'Hier verbinden sich Notizen und ein Scrumban-Board. Das Projekt „Willkommen bei Scrumbanize“ zeigt alles an Beispielen – in einer Minute kennst du die wichtigsten Stellen.',
  },
  {
    target: 'areas',
    title: 'Projekte und Wissen',
    text: 'Oben links wechselst du zwischen zwei Bereichen: Projekte mit Notizen und Board – und Wissen mit Notizbüchern für alles, was zu keinem Projekt gehört, etwa Rezepte oder Mitschriften. Jeder Bereich merkt sich, wo du zuletzt warst.',
  },
  {
    target: 'project-switcher',
    title: 'Projekte',
    text: 'Jedes Projekt hat eigene Notizen, Spalten und Swimlanes. Hier wechselst du Projekte, legst neue an und gibst ihnen eine Farbe.',
  },
  {
    target: 'tab-notes',
    title: 'Notizen',
    text: 'Schreibe formatiert mit Checklisten und Hervorhebungen, hänge Dateien an und mach aus markiertem Text mit einem Klick einen Task.',
  },
  {
    target: 'tab-board',
    title: 'Board',
    text: 'Ziehe Karten durch die Spalten, setze Prioritäten, Fälligkeiten und Verknüpfungen. WIP-Limits zeigen, wo es sich staut.',
  },
  {
    target: 'tab-calendar',
    title: 'Kalender',
    text: 'Alle Fälligkeiten im Monat oder in der Woche. Termine verschiebst du per Drag-and-Drop.',
  },
  {
    target: 'tab-analytics',
    title: 'Statistiken',
    text: 'Wie viele Tasks pro Woche fertig werden, wie lange sie brauchen und wann eine Spalte über ihrem WIP-Limit lag – gerechnet aus dem Verlauf des Projekts.',
  },
  {
    target: 'search',
    title: 'Suchen und Befehle',
    text: 'Mit Strg+K (Mac: ⌘K) findest du Notizen und Tasks aller Projekte und erreichst jede Funktion – auch diese Einführung.',
  },
  {
    target: 'header-tools',
    title: 'Papierkorb, Einstellungen und Aktivität',
    text: 'Gelöschtes landet im Papierkorb und lässt sich wiederherstellen. Im Zahnrad liegen Backup, Import, Export und Vorlagen – in der Desktop-App auch Erinnerungen und Tastenkombination. Die Uhr zeigt, was zuletzt passiert ist.',
  },
];

/** "done": never again; "later": show again on the next start; "new": not seen yet. */
export type TourStatus = 'new' | 'later' | 'done';
export interface TourState {
  status: TourStatus;
  at?: string;
}

export const TOUR_STORAGE_KEY = 'scrumbanize.onboarding';
export const INITIAL_TOUR_STATE: TourState = { status: 'new' };

export function isTourState(value: unknown): value is TourState {
  const status = (value as TourState | null)?.status;
  return status === 'new' || status === 'later' || status === 'done';
}

/** The state after the tour was skipped or finished; the checkbox decides whether it ever comes back. */
export function closedTourState(dontShowAgain: boolean, now = new Date()): TourState {
  return { status: dontShowAgain ? 'done' : 'later', at: now.toISOString() };
}

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface CardPlacement {
  top: number;
  left: number;
  /** Where the arrow points from, or none for a centered card. */
  side: 'below' | 'above' | 'center';
  /** Horizontal position of the arrow within the card. */
  arrowLeft: number;
}

const GAP = 12;
const MARGIN = 16;

/**
 * Where the card goes: below the target (above if there is no room), horizontally centered on it and kept
 * inside the window; centered in the window without a target.
 */
export function placeCard(target: Rect | null, card: { width: number; height: number }, viewport: { width: number; height: number }): CardPlacement {
  if (!target) {
    return {
      top: Math.max(MARGIN, (viewport.height - card.height) / 2),
      left: Math.max(MARGIN, (viewport.width - card.width) / 2),
      side: 'center',
      arrowLeft: 0,
    };
  }
  const centre = target.left + target.width / 2;
  const left = Math.min(Math.max(MARGIN, centre - card.width / 2), Math.max(MARGIN, viewport.width - card.width - MARGIN));
  const below = target.top + target.height + GAP;
  const fitsBelow = below + card.height <= viewport.height - MARGIN;
  const top = fitsBelow ? below : Math.max(MARGIN, target.top - GAP - card.height);
  const arrowLeft = Math.min(Math.max(16, centre - left), card.width - 16);
  return { top, left, side: fitsBelow ? 'below' : 'above', arrowLeft };
}
