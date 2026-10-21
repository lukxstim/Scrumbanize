import Button from './ui/Button';

/** Where typing goes: inputs and the rich text editor, not buttons or links. Focus there takes the lock (US-24). */
export const isTextField = (target: EventTarget) =>
  target instanceof HTMLElement && (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

/** Someone else is editing (US-24): read-only here, unless the user takes over. */
export default function LockNotice({ holder, what, onTakeOver }: { holder: string; what: string; onTakeOver: () => void }) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-2 border-b border-line bg-warning-muted px-6 py-2 text-sm text-warning-text">
      <span className="min-w-0 flex-1">
        Wird gerade von {holder} bearbeitet – {what} ist hier schreibgeschützt, damit sich nichts überschneidet.
      </span>
      <Button size="sm" onClick={onTakeOver}>
        Trotzdem bearbeiten
      </Button>
    </div>
  );
}
