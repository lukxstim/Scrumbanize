/** When the page uses the service worker of the installable web app (US-25), without the browser, so it can be tested. */

export interface ServiceWorkerEnvironment {
  /** A production build: the dev server has no dist/sw.js. */
  production: boolean;
  /** The browser has `navigator.serviceWorker`. */
  supported: boolean;
  /** HTTPS or localhost; browsers refuse service workers elsewhere. */
  secure: boolean;
  /** The desktop app (Electron): it ships its own copy of the page and updates with the app. */
  desktop: boolean;
}

/** The Electron window: the bridge of its preload script, or Electron's user agent should the bridge be missing. */
export function isDesktopApp(hasBridge: boolean, userAgent: string): boolean {
  return hasBridge || /\bElectron\//.test(userAgent);
}

export function shouldRegisterServiceWorker(env: ServiceWorkerEnvironment): boolean {
  return env.production && env.supported && env.secure && !env.desktop;
}

export function currentServiceWorkerEnvironment(): ServiceWorkerEnvironment {
  return {
    production: import.meta.env.PROD,
    supported: 'serviceWorker' in navigator,
    secure: window.isSecureContext,
    desktop: isDesktopApp(!!window.scrumbanizeDesktop, navigator.userAgent),
  };
}

/** How often an open page asks the server for a new version, besides on every navigation the browser does itself. */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
