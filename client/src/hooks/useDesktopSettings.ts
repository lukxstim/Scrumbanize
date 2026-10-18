import { useCallback, useEffect, useState } from 'react';
import type { DesktopSettings, DesktopSettingsPatch, UpdateSettingsResult } from '../types/desktop';

/** The desktop app's functions; undefined in the browser (web and Docker). */
export const desktopBridge = typeof window === 'undefined' ? undefined : window.scrumbanizeDesktop;

/** Tray, shortcut, autostart and reminder settings of the desktop app (US-18); `settings` stays null in the browser. */
export function useDesktopSettings() {
  const [settings, setSettings] = useState<DesktopSettings | null>(null);

  useEffect(() => {
    if (!desktopBridge) return;
    let live = true;
    desktopBridge.getSettings().then(
      (loaded) => live && setSettings(loaded),
      () => {},
    );
    return () => {
      live = false;
    };
  }, []);

  const update = useCallback(async (patch: DesktopSettingsPatch): Promise<UpdateSettingsResult> => {
    const result = await desktopBridge!.updateSettings(patch);
    setSettings(result.settings);
    return result;
  }, []);

  return { settings, update };
}
