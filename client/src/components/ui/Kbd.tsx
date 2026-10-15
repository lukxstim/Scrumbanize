import type { ReactNode } from 'react';

/** True on Apple platforms, where shortcuts use ⌘ instead of Ctrl. */
export const isApple = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** "⌘" or "Ctrl", for showing shortcuts. */
export const modKey = isApple ? '⌘' : 'Ctrl';

export default function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-surface-muted px-1 font-sans text-[11px] font-medium text-fg-subtle">
      {children}
    </kbd>
  );
}
