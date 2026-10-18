import type { ReactNode } from 'react';

/** A card with a heading and a short description: the building block of the settings, profile and user pages. */
export default function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-xl border border-line bg-surface p-5 shadow-card">
      <h2 className="text-sm font-semibold text-fg">{title}</h2>
      <p className="mt-0.5 mb-4 text-sm text-fg-subtle">{description}</p>
      {children}
    </section>
  );
}
