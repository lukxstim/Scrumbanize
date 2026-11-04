import { useNotesView } from '../../hooks/useNotesView';
import type { NotesLayout } from '../../utils/notesView';

const LAYOUTS: { value: NotesLayout; label: string; hint: string }[] = [
  { value: 'tree', label: 'Notizbuch (wie OneNote)', hint: 'Abschnitte unter dem Notizbuch, daneben ihre Seiten' },
  { value: 'list', label: 'Liste', hint: 'Alle Notizen mit Textanfang und Datum, Ordner als Baum' },
];

/** The choices of the notes view (US-34), in the settings. */
export function NotesViewOptions({ idPrefix }: { idPrefix: string }) {
  const [view, setView] = useNotesView();
  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="text-xs font-medium text-fg-subtle">Darstellung</legend>
        <div className="mt-1.5 space-y-1">
          {LAYOUTS.map((option) => (
            <label key={option.value} className="flex cursor-pointer items-start gap-2 text-sm text-fg pointer-coarse:min-h-11">
              <input
                type="radio"
                name={`${idPrefix}-notes-layout`}
                checked={view.layout === option.value}
                onChange={() => setView({ ...view, layout: option.value })}
                className="mt-1 size-3.5 accent-accent"
              />
              <span>
                <span className="block">{option.label}</span>
                <span className="block text-xs text-fg-subtle">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-fg pointer-coarse:min-h-11">
        <input
          type="checkbox"
          checked={view.showTags}
          onChange={(event) => setView({ ...view, showTags: event.target.checked })}
          className="size-3.5 accent-accent"
        />
        Tags anzeigen
      </label>
    </div>
  );
}
