import { useEffect, useState } from 'react';
import { desktopBridge } from '../../hooks/useDesktopSettings';
import { useToast } from '../../hooks/useToast';
import { calendarFeedApi } from '../../utils/api';
import { feedUrl, webcalUrl } from '../../utils/calendarFeed';
import { formatDate } from '../../utils/format';
import ConfirmDialog from '../ConfirmDialog';
import { CalendarIcon } from '../icons';
import Button, { buttonClass } from '../ui/Button';
import Section from '../ui/Section';
import { fieldClass } from '../ui/styles';

type Feed = { createdAt: string } | null;

/**
 * The calendar subscription (US-33): a secret link with the person's tasks that have a start or due date, for
 * Outlook, Google Calendar or Apple Calendar. The server keeps only a hash, so the link shows only right after it was
 * made; a new link ends the old one.
 */
export default function CalendarFeedSection() {
  const toast = useToast();
  // undefined while loading.
  const [feed, setFeed] = useState<Feed | undefined>(undefined);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'renew' | 'revoke' | null>(null);

  useEffect(() => {
    calendarFeedApi
      .status()
      .then((res) => setFeed(res.feed))
      .catch(() => setFeed(null));
  }, []);

  async function renew() {
    setConfirm(null);
    setBusy(true);
    try {
      const made = await calendarFeedApi.renew();
      setFeed({ createdAt: made.createdAt });
      setUrl(feedUrl(window.location.origin, made.token));
      setCopied(false);
    } catch {
      toast({ message: 'Der Kalender-Link konnte nicht erstellt werden.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setConfirm(null);
    setBusy(true);
    try {
      await calendarFeedApi.revoke();
      setFeed(null);
      setUrl(null);
      toast({ message: 'Der Kalender-Link funktioniert nicht mehr.' });
    } catch {
      toast({ message: 'Der Kalender-Link konnte nicht widerrufen werden.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  // Only the computer itself reaches the desktop app's address.
  const local = desktopBridge !== undefined || ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

  return (
    <Section
      title="Kalender abonnieren"
      description="Deine Aufgaben mit Start- oder Fälligkeitsdatum in Outlook, Google Kalender oder Apple Kalender, als ganztägige Termine. Gilt für dein Konto."
    >
      {feed === undefined ? (
        <p className="text-sm text-fg-subtle">Wird geladen …</p>
      ) : url ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              readOnly
              value={url}
              aria-label="Kalender-Link"
              onFocus={(event) => event.target.select()}
              className={`min-w-0 flex-1 font-mono text-xs ${fieldClass}`}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={() => void navigator.clipboard?.writeText(url).then(() => setCopied(true))}
            >
              {copied ? 'Kopiert' : 'Kopieren'}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={webcalUrl(url)} className={buttonClass('secondary', 'sm')}>
              <CalendarIcon className="size-3.5" />
              In Kalender-App öffnen
            </a>
          </div>
          <p className="text-xs text-fg-subtle">
            Der Link wird nur jetzt angezeigt. Wer ihn hat, sieht deine Termine ohne Anmeldung – gib ihn nicht weiter. In Google Kalender: „Weitere
            Kalender“ → „Per URL“. Kalender-Apps holen Änderungen selbst ab, meist alle paar Stunden.
          </p>
          {local && (
            <p className="text-xs text-fg-subtle">
              Diese Adresse erreichen nur Kalender-Apps auf diesem Computer, solange Scrumbanize läuft. Für Google Kalender oder das Handy brauchst du
              Scrumbanize auf einem Server.
            </p>
          )}
        </div>
      ) : feed ? (
        <p className="text-sm text-fg-muted">
          Ein Kalender-Link ist aktiv, seit {formatDate(feed.createdAt)}. Er wird aus Sicherheitsgründen nicht noch einmal angezeigt; ein neuer Link
          ersetzt ihn.
        </p>
      ) : (
        <p className="text-sm text-fg-muted">Noch kein Kalender-Link.</p>
      )}

      {feed !== undefined && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant={feed ? 'secondary' : 'primary'} disabled={busy} onClick={() => (feed ? setConfirm('renew') : void renew())}>
            {feed ? 'Neuen Link erstellen' : 'Kalender-Link erstellen'}
          </Button>
          {feed && (
            <Button size="sm" variant="danger-ghost" disabled={busy} onClick={() => setConfirm('revoke')}>
              Widerrufen
            </Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirm !== null}
        title={confirm === 'revoke' ? 'Kalender-Link widerrufen?' : 'Neuen Kalender-Link erstellen?'}
        message={
          confirm === 'revoke'
            ? 'Kalender, die den Link abonniert haben, bekommen keine Termine mehr. Bereits angezeigte Termine entfernen manche Apps erst später.'
            : 'Der bisherige Link funktioniert dann nicht mehr. Kalender, die ihn abonniert haben, musst du mit dem neuen Link neu einrichten.'
        }
        confirmLabel={confirm === 'revoke' ? 'Widerrufen' : 'Neuen Link erstellen'}
        onConfirm={() => void (confirm === 'revoke' ? revoke() : renew())}
        onCancel={() => setConfirm(null)}
      />
    </Section>
  );
}
