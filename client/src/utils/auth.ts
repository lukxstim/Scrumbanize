import type { AuthSession } from '../types/auth';

/** The query parameter that brings someone back to the page they wanted after logging in. */
export const NEXT_PARAM = 'weiter';

/**
 * Where a protected page sends the browser (US-21): to the setup while there is no administrator, to the login
 * without a user (remembering the page), otherwise nowhere (null: show the page).
 */
export function protectedRedirect(session: AuthSession, currentPath: string): string | null {
  if (session.setupRequired) return '/setup';
  if (session.user) return null;
  const next = currentPath === '/' ? '' : `?${NEXT_PARAM}=${encodeURIComponent(currentPath)}`;
  return `/login${next}`;
}

/**
 * The page to open after logging in: the remembered one if it is a path of this app. Anything else – another site
 * ("https://…", "//…"), the login itself – leads to the start page, so a link cannot send someone elsewhere.
 */
export function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  if (next.startsWith('/login') || next.startsWith('/setup')) return '/';
  return next;
}

/** "Lukas Bergmann" → "LB", "lukas" → "L", for the avatar without a picture. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0]![0]!;
  const last = words.length > 1 ? words.at(-1)![0]! : '';
  return (first + last).toLocaleUpperCase('de');
}

const AUTH_ERRORS: Record<string, string> = {
  wrong_credentials: 'E-Mail-Adresse oder Passwort stimmt nicht.',
  too_many_attempts: 'Zu viele Versuche. Bitte warte ein paar Minuten und versuche es dann erneut.',
  wrong_setup_code: 'Der Einrichtungscode stimmt nicht. Er steht in der Ausgabe des Servers.',
  setup_done: 'Scrumbanize ist bereits eingerichtet. Bitte melde dich an.',
  forbidden_origin: 'Die Anfrage wurde abgelehnt. Bitte öffne Scrumbanize direkt über seine Adresse.',
  invalid_input: 'Bitte prüfe deine Eingaben.',
};

/** A German message for a failed login or setup. */
export function authErrorMessage(code: string | undefined): string {
  return (code && AUTH_ERRORS[code]) || 'Das hat nicht geklappt. Bitte versuche es erneut.';
}
