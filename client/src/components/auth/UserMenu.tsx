import { useAuth } from '../../hooks/useAuth';
import type { AuthUser } from '../../types/auth';
import { initialsOf } from '../../utils/auth';
import { colorDot } from '../../utils/projects';
import Menu from '../Menu';

/** Initials on the user's color (also for project members and activity authors); a profile picture follows with US-21c. */
export function Avatar({ user, className = 'size-7 text-xs' }: { user: Pick<AuthUser, 'name' | 'avatarColor'>; className?: string }) {
  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-full font-semibold text-white ${colorDot(user.avatarColor)} ${className}`}>
      {initialsOf(user.name)}
    </span>
  );
}

/** The avatar at the right of the header, with logout. Not shown without login (desktop app). */
export default function UserMenu() {
  const { session, logout } = useAuth();
  const user = session?.user;
  if (session?.mode !== 'required' || !user) return null;

  return (
    <Menu
      label={`Angemeldet als ${user.name}`}
      trigger={<Avatar user={user} />}
      triggerClassName="grid size-8 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-accent"
      header={
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-fg">{user.name}</p>
          <p className="truncate text-xs text-fg-subtle">{user.email}</p>
        </div>
      }
      items={[{ label: 'Abmelden', onSelect: () => void logout() }]}
    />
  );
}
