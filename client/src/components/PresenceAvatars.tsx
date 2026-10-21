import type { RealtimeActor } from '../types/realtime';
import { namesOf } from '../utils/realtime';
import { Avatar } from './auth/UserMenu';

interface PresenceAvatarsProps {
  people: RealtimeActor[];
  /** "gerade im Projekt", "hat das gerade offen" …: the tooltip and screen readers say "Lukas, Anna: <what>". */
  what: string;
  /** Avatars shown before "+n". */
  max?: number;
  size?: 'sm' | 'md';
  className?: string;
}

const SIZES = { sm: 'size-4 text-[8px]', md: 'size-6 text-[10px]' } as const;

/** Who else is here right now (US-24): overlapping avatars, the rest as "+n". Nothing when nobody is. */
export default function PresenceAvatars({ people, what, max = 3, size = 'md', className = '' }: PresenceAvatarsProps) {
  if (people.length === 0) return null;
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  const label = `${namesOf(people)}: ${what}`;
  return (
    <span role="img" aria-label={label} title={label} className={`flex shrink-0 items-center ${className}`}>
      {shown.map((person, i) => (
        <Avatar key={person.id} user={person} className={`${SIZES[size]} ring-2 ring-surface ${i > 0 ? '-ml-1.5' : ''}`} />
      ))}
      {rest > 0 && (
        <span className={`-ml-1.5 grid place-items-center rounded-full bg-surface-strong font-semibold text-fg-muted ring-2 ring-surface ${SIZES[size]}`}>
          +{rest}
        </span>
      )}
    </span>
  );
}
