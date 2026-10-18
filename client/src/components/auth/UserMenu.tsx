import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../hooks/useAuth';
import type { AuthUser } from '../../types/auth';
import { initialsOf } from '../../utils/auth';
import { accountPaths } from '../../utils/paths';
import { colorDot } from '../../utils/projects';
import Menu from '../Menu';

/**
 * A person's profile picture, or their initials on their color (US-21c): in the header, members lists and the activity
 * log. A picture that does not load (e.g. no longer shared) falls back to the initials.
 */
export function Avatar({
  user,
  className = 'size-7 text-xs',
}: {
  user: Pick<AuthUser, 'name' | 'avatarColor'> & { avatarUrl?: string | null };
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  if (user.avatarUrl && failed !== user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt=""
        aria-hidden="true"
        onError={() => setFailed(user.avatarUrl ?? null)}
        className={`shrink-0 rounded-full bg-surface-muted object-cover ${className}`}
      />
    );
  }
  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-full font-semibold text-white ${colorDot(user.avatarColor)} ${className}`}>
      {initialsOf(user.name)}
    </span>
  );
}

/** The avatar at the right of the header: profile, user management (administrators), logout. Not in the desktop app. */
export default function UserMenu() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
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
      items={[
        { label: 'Profil', onSelect: () => navigate(accountPaths.profile) },
        ...(user.systemRole === 'admin' ? [{ label: 'Benutzerverwaltung', onSelect: () => navigate(accountPaths.users) }] : []),
        { label: 'Abmelden', onSelect: () => void logout() },
      ]}
    />
  );
}
