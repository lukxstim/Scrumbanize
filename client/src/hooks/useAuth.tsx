import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthSession, AuthUser } from '../types/auth';
import { authApi } from '../utils/api';
import { onUnauthorized } from '../utils/appEvents';

interface AuthState {
  status: 'loading' | 'ready' | 'error';
  /** Null until loaded. */
  session: AuthSession | null;
  reload: () => Promise<void>;
  login: (email: string, password: string) => Promise<AuthUser>;
  setup: (input: { code: string; name: string; email: string; password: string }) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Who is logged in (US-21); everything else of the app sits inside, behind <ProtectedRoute>. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [status, setStatus] = useState<AuthState['status']>('loading');

  const reload = useCallback(async () => {
    try {
      setSession(await authApi.session());
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Any request answered with 401 (session expired, logged out in another tab): back to the login.
  useEffect(() => onUnauthorized(() => setSession((current) => (current && current.mode === 'required' ? { ...current, user: null } : current))), []);

  const login = useCallback(async (email: string, password: string) => {
    const { user } = await authApi.login(email, password);
    setSession({ mode: 'required', setupRequired: false, user });
    return user;
  }, []);

  const setup = useCallback(async (input: { code: string; name: string; email: string; password: string }) => {
    const { user } = await authApi.setup(input);
    setSession({ mode: 'required', setupRequired: false, user });
    return user;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => {});
    setSession((current) => current && { ...current, user: null });
  }, []);

  const value = useMemo(() => ({ status, session, reload, login, setup, logout }), [status, session, reload, login, setup, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
