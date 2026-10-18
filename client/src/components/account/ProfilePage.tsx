import { useRef, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import type { AuthUser } from '../../types/auth';
import { accountApi, ApiError } from '../../utils/api';
import { shrinkPicture } from '../../utils/avatar';
import { PROJECT_COLORS } from '../../utils/projects';
import { Avatar } from '../auth/UserMenu';
import Button from '../ui/Button';
import BackToProjects from './BackToProjects';
import Section from '../ui/Section';
import { fieldClass, labelClass } from '../ui/styles';

const MIN_PASSWORD_LENGTH = 10;

/** /profil (US-21c): the own name, picture or color, and password. Only with login. */
export default function ProfilePage() {
  const { session, updateUser } = useAuth();
  const toast = useToast();
  const user = session?.user;
  const [name, setName] = useState(user?.name ?? '');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  if (session?.mode !== 'required' || !user) return <Navigate to="/" replace />;

  async function save(action: () => Promise<{ user: AuthUser }>, message: string) {
    setBusy(true);
    try {
      updateUser((await action()).user);
      toast({ message });
    } catch (error) {
      const code = error instanceof ApiError ? error.code : error instanceof Error ? error.message : '';
      toast({
        message:
          code === 'unsupported_image' || code === 'not_an_image'
            ? 'Bitte ein Foto oder Bild (JPEG, PNG, WebP) wählen.'
            : code === 'too_large'
              ? 'Das Bild ist größer als 20 MB.'
              : 'Das konnte nicht gespeichert werden.',
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-6 px-6 py-8">
        <div>
          <BackToProjects />
          <h1 className="mt-3 text-xl font-semibold tracking-tight text-fg">Profil</h1>
          <p className="mt-1 text-sm text-fg-subtle">So sehen dich die anderen in Projekten und im Verlauf.</p>
        </div>

        <Section title="Bild und Name" description="Ohne Bild erscheinen deine Initialen in deiner Farbe.">
          <div className="flex items-center gap-4">
            <Avatar user={user} className="size-16 text-lg" />
            <div className="flex flex-wrap gap-2">
              <input
                ref={input}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/heic,image/*"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void save(async () => accountApi.uploadAvatar(await shrinkPicture(file)), 'Bild gespeichert.');
                }}
              />
              <Button size="sm" disabled={busy} onClick={() => input.current?.click()}>
                {user.avatarUrl ? 'Anderes Bild …' : 'Bild hochladen …'}
              </Button>
              {user.avatarUrl && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void save(() => accountApi.removeAvatar(), 'Bild entfernt.')}>
                  Bild entfernen
                </Button>
              )}
            </div>
          </div>

          <fieldset className="mt-5">
            <legend className={labelClass}>Farbe</legend>
            <div className="mt-2 flex flex-wrap gap-2.5">
              {PROJECT_COLORS.map((option) => (
                <label
                  key={option.value}
                  title={option.label}
                  className="grid size-8 cursor-pointer place-items-center rounded-full ring-offset-2 ring-offset-surface transition-shadow has-checked:ring-2 has-checked:ring-fg has-focus-visible:outline-2 has-focus-visible:outline-offset-4 has-focus-visible:outline-accent"
                >
                  <input
                    type="radio"
                    name="avatar-color"
                    value={option.value}
                    checked={user.avatarColor === option.value}
                    disabled={busy}
                    onChange={() => void save(() => accountApi.update({ avatarColor: option.value }), 'Farbe gespeichert.')}
                    className="sr-only"
                  />
                  <span className={`size-6 rounded-full transition-transform hover:scale-110 ${option.dot}`} />
                  <span className="sr-only">{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <form
            className="mt-5 flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void save(() => accountApi.update({ name: name.trim() }), 'Name gespeichert.');
            }}
          >
            <label className={`flex-1 ${labelClass}`}>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoComplete="name" className={`mt-1 font-normal ${fieldClass}`} />
            </label>
            <Button type="submit" disabled={busy || !name.trim() || name.trim() === user.name}>
              Speichern
            </Button>
          </form>
          <p className="mt-3 text-sm text-fg-subtle">
            E-Mail-Adresse: <span className="text-fg">{user.email}</span>
          </p>
        </Section>

        <PasswordSection email={user.email} />
      </div>
    </div>
  );
}

/** The current password and a new one; other devices are logged out afterwards. */
function PasswordSection({ email }: { email: string }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`Das neue Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`);
    if (password !== repeat) return setError('Die beiden neuen Passwörter sind nicht gleich.');
    setBusy(true);
    setError(null);
    try {
      await accountApi.changePassword(current, password);
      setCurrent('');
      setPassword('');
      setRepeat('');
      toast({ message: 'Passwort geändert. Auf anderen Geräten bist du jetzt abgemeldet.' });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      setError(
        code === 'wrong_password'
          ? 'Das aktuelle Passwort stimmt nicht.'
          : code === 'too_many_attempts'
            ? 'Zu viele Versuche. Bitte warte ein paar Minuten.'
            : 'Das Passwort konnte nicht geändert werden.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Passwort" description="Nach dem Ändern bist du auf allen anderen Geräten abgemeldet.">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {/* For password managers, so they update the login with the right email. */}
        <input type="email" autoComplete="username" hidden readOnly value={email} />
        {(
          [
            ['Aktuelles Passwort', current, setCurrent, 'current-password'],
            ['Neues Passwort', password, setPassword, 'new-password'],
            ['Neues Passwort wiederholen', repeat, setRepeat, 'new-password'],
          ] as const
        ).map(([label, value, set, autoComplete]) => (
          <label key={label} className={`block ${labelClass}`}>
            {label}
            <input type="password" required value={value} onChange={(e) => set(e.target.value)} autoComplete={autoComplete} className={`mt-1 font-normal ${fieldClass}`} />
          </label>
        ))}
        {error && (
          <p role="alert" className="rounded-lg bg-danger-muted px-3 py-2 text-sm text-danger-text">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" size="sm" disabled={busy}>
          Passwort ändern
        </Button>
      </form>
    </Section>
  );
}
