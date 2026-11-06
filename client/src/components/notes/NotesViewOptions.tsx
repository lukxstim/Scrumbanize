import type { ReactNode } from 'react';
import { useNotesView } from '../../hooks/useNotesView';
import type { NotesLayout } from '../../utils/notesView';

// Little sketches of the views: bars for names and lines for text, in the colors of the app.
const Bar = ({ className = '' }: { className?: string }) => <span className={`block h-1 rounded-full bg-fg-faint/50 ${className}`} />;
const Section = ({ color }: { color: string }) => (
  <span className="flex items-center gap-1">
    <span className={`h-2 w-0.5 rounded-full ${color}`} />
    <Bar className="w-6" />
  </span>
);

function NotebookSketch() {
  return (
    <span className="flex h-full gap-1">
      <span className="flex w-1/4 flex-col gap-1.5 rounded-sm bg-surface-muted p-1.5">
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-sm bg-accent" />
          <Bar className="w-7 bg-fg-subtle/60" />
        </span>
        <span className="flex flex-col gap-1.5 pl-1.5">
          <Section color="bg-amber-500" />
          <Section color="bg-emerald-500" />
          <Section color="bg-sky-500" />
        </span>
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-sm bg-violet-500" />
          <Bar className="w-6 bg-fg-subtle/60" />
        </span>
      </span>
      <span className="flex w-1/4 flex-col gap-1.5 rounded-sm bg-surface-muted p-1.5">
        <span className="rounded-sm bg-surface-strong px-1 py-0.5">
          <Bar className="w-8 bg-fg-subtle/70" />
        </span>
        <Bar className="mx-1 w-7" />
        <Bar className="mx-1 w-9" />
        <Bar className="mx-1 w-6" />
      </span>
      <span className="flex flex-1 flex-col gap-1.5 rounded-sm border border-line p-1.5">
        <Bar className="h-1.5 w-12 bg-fg-subtle/70" />
        <Bar className="w-full" />
        <Bar className="w-5/6" />
        <Bar className="w-2/3" />
      </span>
    </span>
  );
}

function ListSketch() {
  const item = (
    <span className="flex flex-col gap-1 border-b border-line pb-1.5 last:border-0">
      <Bar className="w-9 bg-fg-subtle/70" />
      <Bar className="w-full" />
      <span className="flex gap-0.5">
        <span className="h-1.5 w-3 rounded-sm bg-accent/30" />
        <span className="h-1.5 w-4 rounded-sm bg-accent/30" />
      </span>
    </span>
  );
  return (
    <span className="flex h-full gap-1">
      <span className="flex w-1/5 flex-col gap-1.5 rounded-sm bg-surface-muted p-1.5">
        <Bar className="w-6 bg-fg-subtle/60" />
        <Bar className="w-5 bg-fg-subtle/60" />
        <Bar className="w-6 bg-fg-subtle/60" />
      </span>
      <span className="flex w-1/3 flex-col gap-1.5 rounded-sm bg-surface-muted p-1.5">
        {item}
        {item}
      </span>
      <span className="flex flex-1 flex-col gap-1.5 rounded-sm border border-line p-1.5">
        <Bar className="h-1.5 w-10 bg-fg-subtle/70" />
        <Bar className="w-full" />
        <Bar className="w-3/4" />
      </span>
    </span>
  );
}

const LAYOUTS: { value: NotesLayout; label: string; hint: string; sketch: ReactNode }[] = [
  {
    value: 'tree',
    label: 'Notizbuch-Ansicht',
    hint: 'Wie OneNote: links die Notizbücher mit ihren Abschnitten, daneben die Seiten, rechts die Seite.',
    sketch: <NotebookSketch />,
  },
  {
    value: 'list',
    label: 'Listen-Ansicht',
    hint: 'Die Notizen eines Notizbuchs mit Textanfang und Datum, Ordner als Baum.',
    sketch: <ListSketch />,
  },
];

/** The choices of the notes view (US-34), in the settings: a card with a sketch per view, and the tags. */
export function NotesViewOptions({ idPrefix }: { idPrefix: string }) {
  const [view, setView] = useNotesView();
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="text-xs font-medium text-fg-subtle">Darstellung</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {LAYOUTS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer flex-col gap-2.5 rounded-lg border border-line p-3 transition-colors hover:border-line-strong has-checked:border-accent has-checked:bg-accent-muted/40 has-checked:ring-1 has-checked:ring-accent has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent"
            >
              <span aria-hidden="true" className="block h-20 rounded-md bg-surface p-1.5 ring-1 ring-line">
                {option.sketch}
              </span>
              <span className="flex items-start gap-2">
                <input
                  type="radio"
                  name={`${idPrefix}-notes-layout`}
                  checked={view.layout === option.value}
                  onChange={() => setView({ ...view, layout: option.value })}
                  className="mt-0.5 size-3.5 accent-accent"
                />
                <span>
                  <span className="block text-sm font-medium text-fg">{option.label}</span>
                  <span className="block text-xs text-fg-subtle">{option.hint}</span>
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line p-3 hover:border-line-strong has-focus-visible:outline-2 has-focus-visible:outline-accent">
        <input
          type="checkbox"
          checked={view.showTags}
          onChange={(event) => setView({ ...view, showTags: event.target.checked })}
          className="mt-0.5 size-3.5 accent-accent"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-fg">Tags anzeigen</span>
          <span className="block text-xs text-fg-subtle">An den Seiten und als Filter über den Seiten.</span>
        </span>
        <span aria-hidden="true" className="flex shrink-0 gap-1 pt-0.5">
          {['rezept', 'uni'].map((tag) => (
            <span key={tag} className="rounded bg-surface-muted px-1.5 py-0.5 text-[11px] text-fg-muted">
              #{tag}
            </span>
          ))}
        </span>
      </label>
      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line p-3 hover:border-line-strong has-focus-visible:outline-2 has-focus-visible:outline-accent">
        <input
          type="checkbox"
          checked={view.backlinksOpen}
          onChange={(event) => setView({ ...view, backlinksOpen: event.target.checked })}
          className="mt-0.5 size-3.5 accent-accent"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-fg">„Verlinkt von“ aufgeklappt</span>
          <span className="block text-xs text-fg-subtle">Unter der Notiz die Seiten und Aufgaben zeigen, die auf sie verlinken. Sonst nur die Anzahl, ein Klick klappt sie auf.</span>
        </span>
      </label>
    </div>
  );
}
