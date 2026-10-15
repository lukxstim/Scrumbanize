import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { menuItemClass, popoverClass } from './ui/styles';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  /** A reason shown as tooltip makes the item unavailable. */
  disabledReason?: string;
  danger?: boolean;
}

interface MenuProps {
  /** Accessible name of the trigger button, e.g. "Spalte „Review“: Aktionen". */
  label: string;
  /** Visible content of the trigger button. */
  trigger: ReactNode;
  items: MenuItem[];
  align?: 'left' | 'right';
  triggerClassName?: string;
}

/** A button that opens a list of actions; arrow keys move, Escape closes, a click outside closes. */
export default function Menu({ label, trigger, items, align = 'right', triggerClassName = '' }: MenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const menuItems = () => [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [])];

  function close(focusButton = true) {
    setOpen(false);
    if (focusButton) buttonRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    menuItems()[0]?.focus();
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  function onKeyDown(event: KeyboardEvent) {
    // Keys inside the menu must not reach the board, e.g. Space would start a drag on a column header.
    event.stopPropagation();
    const list = menuItems();
    const index = list.indexOf(document.activeElement as HTMLElement);
    const focus = (i: number) => list[(i + list.length) % list.length]?.focus();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focus(index + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focus(index - 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') {
      close(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          className={`absolute top-full z-30 mt-1 w-52 text-left ${popoverClass} ${
            align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left'
          }`}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              aria-disabled={item.disabledReason ? true : undefined}
              title={item.disabledReason}
              onClick={() => {
                if (item.disabledReason) return;
                close(false);
                item.onSelect();
              }}
              className={`${menuItemClass} ${
                item.disabledReason
                  ? '!cursor-not-allowed !bg-transparent !text-fg-faint'
                  : item.danger
                    ? '!text-danger-text hover:!bg-danger-muted focus:!bg-danger-muted'
                    : ''
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
