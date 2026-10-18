import { describe, expect, it } from 'vitest';
import type { AuthSession, AuthUser } from '../types/auth';
import { authErrorMessage, initialsOf, protectedRedirect, safeNextPath } from './auth';

const user: AuthUser = { id: 1, email: 'l@example.com', name: 'Lukas', systemRole: 'admin', avatarColor: 'indigo', avatarUrl: null };
const session = (patch: Partial<AuthSession>): AuthSession => ({ mode: 'required', setupRequired: false, user: null, ...patch });

describe('protectedRedirect', () => {
  it('sends to the setup until there is an administrator', () => {
    expect(protectedRedirect(session({ setupRequired: true }), '/p/1/board')).toBe('/setup');
  });

  it('sends to the login without a user and remembers the page', () => {
    expect(protectedRedirect(session({}), '/p/1/tasks/7?activity=1')).toBe('/login?weiter=%2Fp%2F1%2Ftasks%2F7%3Factivity%3D1');
    expect(protectedRedirect(session({}), '/')).toBe('/login');
  });

  it('shows the page to a user, also without login (desktop app)', () => {
    expect(protectedRedirect(session({ user }), '/p/1/board')).toBeNull();
    expect(protectedRedirect(session({ mode: 'local', user }), '/p/1/board')).toBeNull();
  });
});

describe('safeNextPath', () => {
  it('returns to pages of this app', () => {
    expect(safeNextPath('/p/1/tasks/7?activity=1')).toBe('/p/1/tasks/7?activity=1');
  });

  it('never leads to another site or back to the login', () => {
    for (const next of [null, '', 'https://boese.example', '//boese.example', '/\\boese.example', 'javascript:alert(1)', '/login', '/setup']) {
      expect(safeNextPath(next), String(next)).toBe('/');
    }
  });
});

describe('initialsOf', () => {
  it('takes the first letters of the first and last name', () => {
    expect(initialsOf('Lukas Tim Bergmann')).toBe('LB');
    expect(initialsOf('  lukas ')).toBe('L');
    expect(initialsOf('Özil ümit')).toBe('ÖÜ');
    expect(initialsOf('')).toBe('?');
  });
});

describe('authErrorMessage', () => {
  it('explains known errors in German', () => {
    expect(authErrorMessage('wrong_credentials')).toBe('E-Mail-Adresse oder Passwort stimmt nicht.');
    expect(authErrorMessage('irgendwas')).toBe('Das hat nicht geklappt. Bitte versuche es erneut.');
  });
});
