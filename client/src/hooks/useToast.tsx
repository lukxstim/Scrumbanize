import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { onDialogOpened } from '../utils/appEvents';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastOptions {
  message: string;
  tone?: ToastTone;
  /** E.g. "Rückgängig"; the toast closes after the action runs. */
  action?: { label: string; onClick: () => void | Promise<void> };
  /** Milliseconds until it disappears; errors stay a little longer by default. `Infinity` keeps it until closed. */
  duration?: number;
}

interface Toast extends Required<Pick<ToastOptions, 'message' | 'tone'>> {
  id: number;
  action?: ToastOptions['action'];
}

type ShowToast = (options: ToastOptions) => void;

const ToastContext = createContext<ShowToast | null>(null);

const TONE_DOT: Record<ToastTone, string> = {
  success: 'bg-emerald-500',
  error: 'bg-red-500',
  info: 'bg-accent',
};

/** Short notifications in the bottom-right corner, announced to screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((t) => t.id !== id)), []);

  const show = useCallback<ShowToast>(
    ({ message, tone = 'success', action, duration }) => {
      const id = nextId.current++;
      // At most three at a time; the oldest goes first.
      setToasts((current) => [...current.slice(-2), { id, message, tone, action }]);
      const ms = duration ?? (tone === 'error' ? 7000 : action ? 8000 : 4000);
      // setTimeout would fire right away for Infinity.
      if (Number.isFinite(ms)) setTimeout(() => dismiss(id), ms);
    },
    [dismiss],
  );

  const value = useMemo(() => show, [show]);

  // Modal dialogs live in the browser's top layer, above any z-index. The toasts are a popover, which is
  // in the top layer too; re-showing it moves it above dialogs opened in the meantime.
  const containerRef = useRef<HTMLDivElement>(null);
  const raise = useCallback(() => {
    const container = containerRef.current;
    if (!container?.showPopover) return;
    if (container.matches(':popover-open')) container.hidePopover();
    container.showPopover();
  }, []);

  useEffect(() => {
    if (toasts.length > 0) raise();
  }, [toasts, raise]);

  useEffect(() => onDialogOpened(() => toasts.length > 0 && raise()), [toasts, raise]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        ref={containerRef}
        popover="manual"
        aria-live="polite"
        className="pointer-events-none fixed inset-auto bottom-4 right-4 m-0 flex w-80 flex-col items-stretch gap-2 overflow-visible border-0 bg-transparent p-0"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex animate-toast-in items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-fg shadow-popover"
          >
            <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${TONE_DOT[toast.tone]}`} />
            <span className="min-w-0 flex-1">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                onClick={async () => {
                  dismiss(toast.id);
                  await toast.action!.onClick();
                }}
                className="shrink-0 font-medium text-accent-text hover:underline"
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label="Schließen"
              onClick={() => dismiss(toast.id)}
              className="-mr-1 shrink-0 leading-none text-fg-faint hover:text-fg"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ShowToast {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
