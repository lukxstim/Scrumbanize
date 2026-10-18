import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAuth } from '../../hooks/useAuth';
import { ApiError, authApi } from '../../utils/api';
import { authErrorMessage } from '../../utils/auth';
import Button from '../ui/Button';
import AuthLayout, { AuthError, AuthField } from './AuthLayout';

const MIN_PASSWORD_LENGTH = 10;

const LINK_ERRORS: Record<string, string> = {
  invalid_link: 'Dieser Link gilt nicht mehr – er wurde schon benutzt oder ist abgelaufen. Bitte um einen neuen.',
  email_taken: 'Für diese E-Mail-Adresse gibt es schon ein Konto. Melde dich damit an.',
};
const linkError = (error: unknown) => {
  const code = error instanceof ApiError ? error.code : undefined;
  return (code && LINK_ERRORS[code]) || authErrorMessage(code);
};

/** Checks the link when the page opens; null while loading. */
function useLinkInfo<T>(load: () => Promise<T>): { info: T | null; error: string | null } {
  const [info, setInfo] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    load().then(setInfo, (err: unknown) => setError(linkError(err)));
    // The token does not change while the page is open.
  }, []);
  return { info, error };
}

/** Two password fields with the shared rules; returns an error text or null. */
function checkPasswords(password: string, repeat: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Das Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`;
  if (password !== repeat) return 'Die beiden Passwörter sind nicht gleich.';
  return null;
}

function Invalid({ message }: { message: string }) {
  return (
    <div className="space-y-4">
      <AuthError message={message} />
      <Link to="/login" className="block text-center text-sm font-medium text-accent-text hover:underline">
        Zur Anmeldung
      </Link>
    </div>
  );
}

/** /einladung/:token (US-21c): someone invited creates their account; the email comes from the invitation. */
export function InvitePage() {
  const token = useParams().token ?? '';
  const { register } = useAuth();
  const navigate = useNavigate();
  const { info, error: linkProblem } = useLinkInfo(() => authApi.invitation(token));
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const problem = checkPasswords(password, repeat);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await register(token, name.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(linkError(err));
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Willkommen bei Scrumbanize" intro={info ? `Du wurdest mit ${info.email} eingeladen. Leg dein Konto an.` : undefined}>
      {linkProblem ? (
        <Invalid message={linkProblem} />
      ) : !info ? (
        <p className="text-sm text-fg-subtle">Einladung wird geprüft …</p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {/* For password managers, so they save the login with the right email. */}
          <input type="email" autoComplete="username" value={info.email} readOnly hidden />
          <AuthField label="Dein Name" required autoFocus autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
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
            {busy ? 'Konto wird angelegt …' : 'Konto anlegen'}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

/** /passwort/:token (US-21c): a new password from a link the administrator passed on. */
export function ResetPage() {
  const token = useParams().token ?? '';
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const { info, error: linkProblem } = useLinkInfo(() => authApi.resetInfo(token));
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const problem = checkPasswords(password, repeat);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await resetPassword(token, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(linkError(err));
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Neues Passwort" intro={info ? `Für ${info.name} (${info.email}). Danach bist du auf allen Geräten abgemeldet.` : undefined}>
      {linkProblem ? (
        <Invalid message={linkProblem} />
      ) : !info ? (
        <p className="text-sm text-fg-subtle">Link wird geprüft …</p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <input type="email" autoComplete="username" value={info.email} readOnly hidden />
          <AuthField
            label="Neues Passwort"
            type="password"
            required
            autoFocus
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint={`Mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`}
          />
          <AuthField label="Passwort wiederholen" type="password" required autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
          <AuthError message={error} />
          <Button type="submit" variant="primary" className="w-full" disabled={busy}>
            {busy ? 'Wird gespeichert …' : 'Passwort speichern und anmelden'}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
