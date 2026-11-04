import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { popoverClass } from './styles';

interface PopoverProps {
  /** Accessible name of the trigger button. */
  label: string;
  trigger: ReactNode;
  triggerClassName?: string;
  /** Shown in the trigger's tooltip. */
  title?: string;
  align?: 'left' | 'right';
  panelClassName?: string;
  children: ReactNode;
}

/**
 * A button that opens a small panel with controls (checkboxes, options) instead of actions like `Menu`: it stays open
 * while they are used; Escape or a click outside closes it.
 */
export default function Popover({ label, trigger, triggerClassName = '', title, align = 'left', panelClassName = 'w-60', children }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>('input, button')?.focus();
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        title={title}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((o) => !o)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={label}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Escape') {
              event.preventDefault();
              setOpen(false);
              buttonRef.current?.focus();
            }
          }}
          className={`absolute top-full z-30 mt-1 text-left ${popoverClass} ${panelClassName} ${
            align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left'
          }`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
