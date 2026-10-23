import { describe, expect, it } from 'vitest';
import { isDesktopApp, shouldRegisterServiceWorker, type ServiceWorkerEnvironment } from './serviceWorker';

const browser: ServiceWorkerEnvironment = { production: true, supported: true, secure: true, desktop: false };

describe('service worker registration', () => {
  it('registers in a production build in a browser over HTTPS', () => {
    expect(shouldRegisterServiceWorker(browser)).toBe(true);
  });

  it('never registers in the desktop app', () => {
    expect(shouldRegisterServiceWorker({ ...browser, desktop: true })).toBe(false);
  });

  it('never registers on the dev server, without support or without HTTPS', () => {
    expect(shouldRegisterServiceWorker({ ...browser, production: false })).toBe(false);
    expect(shouldRegisterServiceWorker({ ...browser, supported: false })).toBe(false);
    expect(shouldRegisterServiceWorker({ ...browser, secure: false })).toBe(false);
  });

  it('recognizes the desktop app by its bridge or by Electron in the user agent', () => {
    const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
    const electron = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Scrumbanize/1.1.0 Chrome/140.0.0.0 Electron/44.7.2 Safari/537.36';
    expect(isDesktopApp(true, chrome)).toBe(true);
    expect(isDesktopApp(false, electron)).toBe(true);
    expect(isDesktopApp(false, chrome)).toBe(false);
    expect(isDesktopApp(false, 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1')).toBe(false);
  });
});
