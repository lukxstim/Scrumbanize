import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useAuth } from '../../hooks/useAuth';
import { ApiError } from '../../utils/api';
import { authErrorMessage } from '../../utils/auth';
import Button from '../ui/Button';
import AuthLayout, { AuthError, AuthField } from './AuthLayout';

const MIN_PASSWORD_LENGTH = 10;

/**
 * /setup (US-21): the first administrator of a server with login. The one-time code is only in the server's output,
 * so nobody who merely finds the address can claim the server.
 */
export default function SetupPage() {
  const { session, setup } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session && !session.setupRequired) return <Navigate to={session.user ? '/' : '/login'} replace />;

  async function submit() {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Das Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`);
      return;
    }
    if (password !== repeat) {
      setError('Die beiden Passwörter sind nicht gleich.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await setup({ code, name: name.trim(), email: email.trim(), password });
      navigate('/', { replace: true });
    } catch (err) {
      setError(authErrorMessage(err instanceof ApiError ? err.code : undefined));
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Scrumbanize einrichten"
      intro="Lege das erste Konto an. Es verwaltet später die Benutzer und übernimmt alle vorhandenen Projekte."
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <AuthField
          label="Einrichtungscode"
          required
          autoFocus
          autoComplete="off"
          spellCheck={false}
          placeholder="XXXX-XXXX"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          hint="Steht in der Ausgabe des Servers, z. B. mit „docker compose logs“."
        />
        <AuthField label="Dein Name" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        <AuthField label="E-Mail-Adresse" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        <AuthField
          label="Passwort"
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={`Mindestens ${MIN_PASSWORD_LENGTH} Zeichen – ein Satz aus mehreren Wörtern ist gut zu merken und sicher.`}
        />
        <AuthField label="Passwort wiederholen" type="password" required autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        <AuthError message={error} />
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>
          {busy ? 'Wird eingerichtet …' : 'Einrichten und anmelden'}
        </Button>
      </form>
    </AuthLayout>
  );
}
