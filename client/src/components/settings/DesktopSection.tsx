import { useState, type KeyboardEvent } from 'react';
import { desktopBridge, useDesktopSettings } from '../../hooks/useDesktopSettings';
import { useToast } from '../../hooks/useToast';
import type { DesktopSettings, DesktopSettingsPatch } from '../../types/desktop';
import { acceleratorFromKeyEvent, acceleratorKeys, DEFAULT_HOTKEY } from '../../utils/hotkey';
import Button from '../ui/Button';
import Kbd from '../ui/Kbd';
import Switch from '../ui/Switch';

/** Settings of the desktop app only (US-18): notification area, starting with Windows, reminders, shortcut. */
export default function DesktopSection() {
  const toast = useToast();
  const { settings, update } = useDesktopSettings();
  if (!settings) return null;

  async function change(patch: DesktopSettingsPatch): Promise<boolean> {
    try {
      const result = await update(patch);
      if (result.ok) return true;
      toast({
        message: result.error === 'hotkey_taken' ? 'Diese Tastenkombination wird schon von einem anderen Programm verwendet.' : 'Die Einstellung konnte nicht gespeichert werden.',
        tone: 'error',
      });
    } catch {
      toast({ message: 'Die Einstellung konnte nicht gespeichert werden.', tone: 'error' });
    }
    return false;
  }

  async function checkNow() {
    try {
      await desktopBridge?.checkReminders();
    } catch {
      toast({ message: 'Die Erinnerungen konnten nicht geprüft werden.', tone: 'error' });
    }
  }

  return (
    <section aria-label="Desktop-App" className="rounded-xl border border-line bg-surface p-5 shadow-card">
      <h2 className="text-sm font-semibold text-fg">Desktop-App</h2>
      <p className="mt-0.5 mb-4 text-sm text-fg-subtle">Infobereich neben der Uhr, Start mit Windows, Erinnerungen an fällige Tasks und eine Tastenkombination.</p>

      <div className="space-y-4">
        <Switch
          label="Beim Schließen in den Infobereich minimieren"
          description="Scrumbanize läuft dann weiter und erinnert an fällige Tasks. Beenden über das Symbol neben der Uhr."
          checked={settings.closeToTray}
          onChange={(closeToTray) => void change({ closeToTray })}
        />
        <Switch
          label="Beim Minimieren in den Infobereich"
          description="Das minimierte Fenster verschwindet aus der Taskleiste."
          checked={settings.minimizeToTray}
          onChange={(minimizeToTray) => void change({ minimizeToTray })}
        />
        <Switch
          label="Mit Windows starten (im Infobereich)"
          description={openAtLoginHint(settings)}
          checked={settings.openAtLogin}
          disabled={!settings.openAtLoginAvailable}
          onChange={(openAtLogin) => void change({ openAtLogin })}
        />
        <div>
          <Switch
            label="Erinnerungen an fällige Tasks"
            description="Eine Windows-Benachrichtigung für Tasks, die heute fällig oder überfällig sind – einmal am Tag, bis sie in der letzten Spalte liegen."
            checked={settings.notifications}
            onChange={(notifications) => void change({ notifications })}
          />
          <Button size="sm" variant="ghost" className="mt-2 -ml-2.5" onClick={() => void checkNow()}>
            Jetzt prüfen
          </Button>
        </div>
        <HotkeyField settings={settings} onChange={(hotkey) => change({ hotkey })} />
      </div>
    </section>
  );
}

function openAtLoginHint(settings: DesktopSettings): string {
  if (!settings.openAtLoginAvailable) return 'Nur in der installierten App verfügbar.';
  if (settings.openAtLogin && !settings.closeToTray) {
    return 'Ohne „Beim Schließen in den Infobereich minimieren“ beendet das Schließen des Fensters Scrumbanize, und bis zur nächsten Anmeldung kommen keine Erinnerungen.';
  }
  return 'Startet ohne Fenster, damit Erinnerungen auch ankommen, wenn du Scrumbanize nicht geöffnet hast.';
}

/** Shows the shortcut and records a new one: click "Ändern", press the keys, Esc cancels. */
function HotkeyField({ settings, onChange }: { settings: DesktopSettings; onChange: (hotkey: string) => Promise<boolean> }) {
  const [recording, setRecording] = useState(false);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    // Nothing else may react while recording, e.g. Ctrl+K opening the command palette.
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      setRecording(false);
      return;
    }
    const accelerator = acceleratorFromKeyEvent(event.nativeEvent);
    if (!accelerator) return;
    setRecording(false);
    if (accelerator !== settings.hotkey) void onChange(accelerator);
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-fg">Fenster nach vorne holen</p>
        <p className="mt-0.5 text-xs text-fg-subtle">
          {settings.hotkeyActive
            ? 'Diese Tastenkombination holt Scrumbanize von überall in den Vordergrund.'
            : 'Die Tastenkombination wird gerade von einem anderen Programm verwendet. Wähle eine andere.'}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {recording ? (
          <button
            type="button"
            autoFocus
            onKeyDown={onKeyDown}
            onBlur={() => setRecording(false)}
            className="h-7 rounded-md border border-accent bg-accent-muted px-2.5 text-xs font-medium text-accent-text focus:outline-none"
          >
            Tasten drücken … (Esc bricht ab)
          </button>
        ) : (
          <>
            <span className={`flex items-center gap-0.5 ${settings.hotkeyActive ? '' : 'line-through opacity-60'}`} aria-label={`Tastenkombination ${acceleratorKeys(settings.hotkey).join(' + ')}`}>
              {acceleratorKeys(settings.hotkey).map((key) => (
                <Kbd key={key}>{key}</Kbd>
              ))}
            </span>
            <Button size="sm" variant="ghost" onClick={() => setRecording(true)}>
              Ändern
            </Button>
            {settings.hotkey !== DEFAULT_HOTKEY && (
              <Button size="sm" variant="ghost" onClick={() => void onChange(DEFAULT_HOTKEY)}>
                Zurücksetzen
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
