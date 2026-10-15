import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { placeCard, TOUR_STEPS, type CardPlacement, type Rect } from '../../utils/tour';
import Button from '../ui/Button';

interface TourProps {
  /** `dontShowAgain`: the state of the checkbox when the tour was skipped or finished. */
  onClose: (dontShowAgain: boolean) => void;
}

const CARD_WIDTH = 320;
const RING_PADDING = 4;

function targetRect(target: string | undefined): Rect | null {
  if (!target) return null;
  const element = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  if (!element) return null;
  const r = element.getBoundingClientRect();
  return r.width === 0 && r.height === 0 ? null : { top: r.top, left: r.left, width: r.width, height: r.height };
}

/**
 * The quick-start guide: a small card next to header elements, with a soft ring around the element it is
 * about. Not modal: the app stays usable. Escape skips, ← and → step.
 */
export default function Tour({ onClose }: TourProps) {
  const [index, setIndex] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(true);
  const [rect, setRect] = useState<Rect | null>(null);
  const [placement, setPlacement] = useState<CardPlacement | null>(null);
  // Moves between steps are animated; the first placement is not, or the card would fly in from off-screen.
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    if (!placement || animated) return;
    const frame = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(frame);
  }, [placement, animated]);
  const cardRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const step = TOUR_STEPS[index]!;
  const last = index === TOUR_STEPS.length - 1;

  const measure = useCallback(() => {
    const target = targetRect(step.target);
    setRect(target);
    const card = cardRef.current;
    if (card) {
      setPlacement(
        placeCard(target, { width: card.offsetWidth, height: card.offsetHeight }, { width: window.innerWidth, height: window.innerHeight }),
      );
    }
  }, [step.target]);

  useLayoutEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [measure]);

  // Each step moves the focus to its heading, so screen readers read the new step.
  useLayoutEffect(() => {
    headingRef.current?.focus();
  }, [index]);

  const go = (next: number) => setIndex(Math.min(Math.max(next, 0), TOUR_STEPS.length - 1));
  const close = () => onClose(dontShowAgain);

  // Escape skips even when the focus is elsewhere (e.g. given back by the command palette), but not while
  // a dialog is open, whose Escape belongs to it.
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('dialog[open]')) return;
      event.preventDefault();
      closeRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      {rect && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 rounded-lg ring-2 ring-accent shadow-[0_0_0_6px_var(--color-accent-muted)] transition-all duration-200"
          style={{
            top: rect.top - RING_PADDING,
            left: rect.left - RING_PADDING,
            width: rect.width + RING_PADDING * 2,
            height: rect.height + RING_PADDING * 2,
          }}
        />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        aria-describedby="tour-text"
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight' && !last && (event.target as HTMLElement).tagName !== 'INPUT') go(index + 1);
          else if (event.key === 'ArrowLeft' && (event.target as HTMLElement).tagName !== 'INPUT') go(index - 1);
        }}
        className={`fixed z-50 rounded-xl border border-line bg-surface p-4 text-fg shadow-popover animate-pop-in ${
          !placement ? 'invisible' : animated ? 'transition-[top,left] duration-200' : ''
        }`}
        style={{
          width: CARD_WIDTH,
          maxWidth: 'calc(100vw - 32px)',
          top: placement?.top ?? -9999,
          left: placement?.left ?? -9999,
        }}
      >
        {placement && placement.side !== 'center' && (
          <span
            aria-hidden="true"
            className={`absolute size-3 rotate-45 border-line bg-surface ${
              placement.side === 'below' ? '-top-1.5 border-t border-l' : '-bottom-1.5 border-r border-b'
            }`}
            style={{ left: placement.arrowLeft - 6 }}
          />
        )}
        <p className="text-xs font-medium text-accent-text" aria-live="polite">
          Schritt {index + 1} von {TOUR_STEPS.length}
        </p>
        <h2 id="tour-title" ref={headingRef} tabIndex={-1} className="mt-1 text-base font-semibold focus:outline-none">
          {step.title}
        </h2>
        <p id="tour-text" className="mt-1.5 text-sm leading-relaxed text-fg-muted">
          {step.text}
        </p>

        <label className="mt-4 flex items-center gap-2 text-xs text-fg-subtle">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(event) => setDontShowAgain(event.target.checked)}
            className="size-3.5 accent-accent"
          />
          Nicht erneut anzeigen
        </label>

        <div className="mt-3 flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={close}>
            Überspringen
          </Button>
          <div className="flex-1" />
          {index > 0 && (
            <Button variant="secondary" size="sm" onClick={() => go(index - 1)}>
              Zurück
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={last ? close : () => go(index + 1)}>
            {last ? 'Fertig' : 'Weiter'}
          </Button>
        </div>
      </div>
    </>
  );
}
