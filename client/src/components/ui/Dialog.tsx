import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { notifyDialogOpened } from '../../utils/appEvents';

interface DialogProps {
  /** Defaults to true, for dialogs that are open while mounted. */
  open?: boolean;
  onClose: () => void;
  /** Id of the element that names the dialog, usually its heading. */
  labelledBy: string;
  /** Width and layout, e.g. "max-w-md p-6". */
  className?: string;
  /** Close when clicking beside the dialog. */
  closeOnBackdrop?: boolean;
  /** False while something is saving, so Escape does not close it halfway. */
  dismissible?: boolean;
  /**
   * "drawer" slides in from the right edge at full height (see index.css) instead of popping up centered; "sheet"
   * slides up from the bottom edge, as menus do on phones (US-25).
   */
  placement?: 'center' | 'drawer' | 'sheet';
  /**
   * On phones (below sm, US-25): `fullscreen` fills the screen (see index.css); `compact` stays a small centered
   * box, for short questions like "Wirklich löschen?". Drawers already fit.
   */
  mobile?: 'fullscreen' | 'compact';
  children: ReactNode;
}

/**
 * A modal <dialog> with the app's look and its open animation (see index.css).
 * Mark the field that should get focus on open with `data-autofocus` (not React's `autoFocus`).
 */
export default function Dialog({
  open = true,
  onClose,
  labelledBy,
  className = '',
  closeOnBackdrop = false,
  dismissible = true,
  placement = 'center',
  mobile = 'fullscreen',
  children,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  // React's autoFocus runs while the dialog is still closed, and showModal() then focuses the dialog itself.
  // So the element marked with data-autofocus is focused here, after opening. A layout effect runs before
  // the browser handles further input, so keys typed right after opening (e.g. after ⌘K) are not lost.
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
      notifyDialogOpened();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      data-placement={placement}
      data-mobile={placement === 'center' ? mobile : undefined}
      className={`${
        placement === 'drawer'
          ? 'm-0 ml-auto h-dvh max-h-none w-[26rem] max-w-full border-l border-line'
          : placement === 'sheet'
            ? 'm-0 mt-auto max-h-[85dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-2xl border-t border-line pb-[env(safe-area-inset-bottom)]'
            : 'm-auto w-full rounded-xl border border-line'
      } bg-surface text-fg shadow-dialog ${className}`}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(event) => {
        if (closeOnBackdrop && dismissible && event.target === ref.current) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
