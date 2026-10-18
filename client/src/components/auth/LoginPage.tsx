import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../../hooks/useAuth';
import { ApiError } from '../../utils/api';
import { authErrorMessage, NEXT_PARAM, safeNextPath } from '../../utils/auth';
import Button from '../ui/Button';
import AuthLayout, { AuthError, AuthField } from './AuthLayout';

/** /login (US-21): email and password; afterwards back to the page that asked for it. */
export default function LoginPage() {
  const { session, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNextPath(params.get(NEXT_PARAM));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session?.setupRequired) return <Navigate to="/setup" replace />;
  if (session?.user) return <Navigate to={next} replace />;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      navigate(next, { replace: true });
    } catch (err) {
      setError(authErrorMessage(err instanceof ApiError ? err.code : undefined));
      setPassword('');
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Bei Scrumbanize anmelden">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <AuthField label="E-Mail-Adresse" type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        <AuthField label="Passwort" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <AuthError message={error} />
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>
          {busy ? 'Anmelden …' : 'Anmelden'}
        </Button>
        <p className="text-center text-xs text-fg-subtle">Passwort vergessen? Die Person, die Scrumbanize verwaltet, kann dir einen Link zum Zurücksetzen schicken.</p>
      </form>
    </AuthLayout>
  );
}
