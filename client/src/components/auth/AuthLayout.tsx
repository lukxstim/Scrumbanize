import type { InputHTMLAttributes, ReactNode } from 'react';
import { fieldClass, labelClass } from '../ui/styles';

/** The frame of the login and setup pages: logo, title, a card in the middle. */
export default function AuthLayout({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10 text-fg">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <img src="/scrumbanize-logo.png" alt="" width={48} height={48} className="size-12 rounded-xl shadow-sm" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
            {intro && <p className="mt-1 text-sm text-fg-subtle">{intro}</p>}
          </div>
        </div>
        <div className="rounded-xl border border-line bg-surface p-6 shadow-card">{children}</div>
      </div>
    </main>
  );
}

/** A labelled input of these pages. */
export function AuthField({
  label,
  hint,
  ...input
}: { label: string; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input {...input} className={`mt-1 ${fieldClass}`} />
      {hint && <span className="mt-1 block text-xs text-fg-subtle">{hint}</span>}
    </label>
  );
}

export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-danger-muted px-3 py-2 text-sm text-danger-text">
      {message}
    </p>
  );
}
