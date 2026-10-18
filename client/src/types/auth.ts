import type { ProjectColor } from './project';

/** The logged-in user (US-21). In the desktop app and with AUTH=off: the local user "Ich". */
export interface AuthUser {
  id: number;
  email: string;
  name: string;
  systemRole: 'admin' | 'user';
  avatarColor: ProjectColor;
  /** The profile picture, or null for initials (US-21c). */
  avatarUrl: string | null;
}

/**
 * `local`: no login (desktop app, AUTH=off). `required`: log in with email and password; `setupRequired` until the
 * first administrator exists.
 */
export interface AuthSession {
  mode: 'local' | 'required';
  setupRequired: boolean;
  user: AuthUser | null;
}
