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
      className={`m-auto w-full rounded-xl border border-line bg-surface text-fg shadow-dialog ${className}`}
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
