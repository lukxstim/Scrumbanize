import { useState, type FormEvent } from 'react';
import { desktopBridge } from '../../hooks/useDesktopSettings';
import type { DesktopSettings, SetServerResult } from '../../types/desktop';
import ConfirmDialog from '../ConfirmDialog';
import Button from '../ui/Button';
import { fieldClass } from '../ui/styles';

const ERRORS: Record<Extract<SetServerResult, { ok: false }>['error'], string> = {
  invalid_url: 'Das ist keine gültige Adresse, z. B. „scrumbanize.onrender.com“.',
  insecure: 'Online-Server gehen nur mit https://. Unverschlüsseltes http:// nur im eigenen Netz.',
  unreachable: 'Der Server antwortet nicht. Stimmt die Adresse, und gibt es eine Internetverbindung? (Ein schlafender Render-Server braucht beim ersten Aufruf bis zu einer Minute.)',
  not_scrumbanize: 'Unter dieser Adresse läuft kein Scrumbanize.',
  unhealthy: 'Der Server antwortet, aber seine Datenbank funktioniert gerade nicht.',
};

/**
 * Where the desktop app's data is (US-31): on this computer, or on an online server – the same data as in the
 * browser and on other computers. The window then shows the server's Scrumbanize, which has its own login.
 */
export default function StorageSetting({ settings }: { settings: DesktopSettings }) {
  const storage = settings.storage;
  const [address, setAddress] = useState(storage?.serverUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmLocal, setConfirmLocal] = useState(false);
  // An app from before US-31 has no storage info and cannot switch.
  if (!storage || !desktopBridge?.setServer) return null;
  const setServer = desktopBridge.setServer;

  async function connect(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await setServer(address);
      // On success the window loads the server's page; nothing more to do here.
      if (!result.ok) setError(ERRORS[result.error]);
    } catch {
      setError('Die Verbindung konnte nicht eingerichtet werden.');
    } finally {
      setBusy(false);
    }
  }

  const onServer = storage.active === 'server';
  return (
    <div className="space-y-3 border-t border-line pt-4">
      <div>
        <p className="text-sm font-medium text-fg">Speicherort</p>
        <p className="mt-0.5 text-xs text-fg-subtle" role="status">
          {onServer ? (
            <>
              <span className="mr-1.5 inline-block size-2 rounded-full bg-emerald-500 align-middle" aria-hidden="true" />
              Verbunden mit <span className="font-medium text-fg-muted">{storage.serverUrl}</span>. Alle Änderungen landen direkt auf dem Server – im Browser
              und auf anderen Computern ist alles auf demselben Stand.
            </>
          ) : storage.serverUrl ? (
            <>
              <span className="mr-1.5 inline-block size-2 rounded-full bg-amber-500 align-middle" aria-hidden="true" />
              {storage.serverUrl} war beim Start nicht erreichbar. Bis zum nächsten Start arbeitest du mit den Daten auf diesem Computer:{' '}
              <span className="font-mono break-all">{storage.localFile}</span>
            </>
          ) : (
            <>
              Auf diesem Computer: <span className="font-mono break-all">{storage.localFile}</span>
            </>
          )}
        </p>
      </div>

      {onServer ? (
        <Button size="sm" variant="ghost" className="-ml-2.5" onClick={() => setConfirmLocal(true)}>
          Wieder auf diesem Computer speichern
        </Button>
      ) : (
        <form onSubmit={(event) => void connect(event)} className="space-y-2">
          <label className="block text-xs font-medium text-fg-subtle" htmlFor="desktop-server-url">
            Mit einem Online-Server arbeiten
          </label>
          <div className="flex gap-2">
            <input
              id="desktop-server-url"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="scrumbanize.onrender.com"
              autoComplete="url"
              inputMode="url"
              spellCheck={false}
              className={`min-w-0 flex-1 ${fieldClass}`}
            />
            <Button type="submit" size="sm" variant="primary" disabled={busy || address.trim() === ''}>
              {busy ? 'Prüft …' : 'Verbinden'}
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-xs text-danger-text">
              {error}
            </p>
          )}
          <p className="text-xs text-fg-subtle">
            Danach meldest du dich mit deinem Konto auf dem Server an. Die Daten auf diesem Computer bleiben, wie sie sind, und werden nicht übertragen –
            zum Mitnehmen hier ein Backup herunterladen und auf dem Server unter „Wiederherstellen“ einspielen. Ohne Internet ist der Server nicht
            erreichbar.
          </p>
        </form>
      )}

      <ConfirmDialog
        open={confirmLocal}
        title="Wieder auf diesem Computer speichern?"
        message={`Scrumbanize zeigt dann wieder die Daten auf diesem Computer. Was du auf ${storage.serverUrl ?? 'dem Server'} geändert hast, bleibt dort und wird nicht übertragen.`}
        confirmLabel="Auf diesem Computer"
        onConfirm={() => {
          setConfirmLocal(false);
          void setServer(null);
        }}
        onCancel={() => setConfirmLocal(false)}
      />
    </div>
  );
}
