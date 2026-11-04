import { screen, type BrowserWindow, type Display, type Rectangle } from 'electron';

/**
 * A window as a Windows app bar (US-26), like the docked Windows Sticky Notes or the taskbar: Windows reserves its
 * strip at the right edge of the screen, so maximised windows and the desktop end next to it instead of under it.
 * Uses the shell's SHAppBarMessage through koffi (prebuilt, no compiler needed). Windows only; elsewhere, or if the
 * library cannot be loaded, `attachAppBar` returns null and the caller just docks the window.
 */

const ABM_NEW = 0x0;
const ABM_REMOVE = 0x1;
const ABM_QUERYPOS = 0x2;
const ABM_SETPOS = 0x3;
const ABM_ACTIVATE = 0x6;
const ABM_WINDOWPOSCHANGED = 0x9;
const ABE_RIGHT = 2;
const ABN_POSCHANGED = 0x1;
const ABN_FULLSCREENAPP = 0x2;
const WM_ACTIVATE = 0x0006;
const WM_WINDOWPOSCHANGED = 0x0047;
/** The message Windows sends the app bar about changes (WM_APP + n). */
const CALLBACK_MESSAGE = 0x8000 + 0x5c;

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface AppBarData {
  cbSize: number;
  hWnd: bigint;
  uCallbackMessage: number;
  uEdge: number;
  rc: Rect;
  lParam: bigint;
}

type AppBarMessage = (message: number, data: AppBarData) => unknown;

let shellMessage: AppBarMessage | null | undefined;
let dataSize = 0;

/** SHAppBarMessage, loaded once; null if this is not Windows or koffi is missing. */
function appBarMessage(log: (line: string) => void): AppBarMessage | null {
  if (shellMessage !== undefined) return shellMessage;
  shellMessage = null;
  if (process.platform !== 'win32') return null;
  try {
    const koffi = require('koffi') as typeof import('koffi');
    const rect = koffi.struct('ScrumbanizeRECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' });
    const data = koffi.struct('ScrumbanizeAPPBARDATA', {
      cbSize: 'uint32',
      hWnd: 'uintptr_t',
      uCallbackMessage: 'uint32',
      uEdge: 'uint32',
      rc: rect,
      lParam: 'intptr_t',
    });
    dataSize = koffi.sizeof(data);
    const shell32 = koffi.load('shell32.dll');
    shellMessage = shell32.func('uintptr_t __stdcall SHAppBarMessage(uint32_t dwMessage, _Inout_ ScrumbanizeAPPBARDATA *pData)') as AppBarMessage;
  } catch (error) {
    log(`App bar not available: ${String(error)}`);
  }
  return shellMessage;
}

export interface AppBar {
  /** Takes the strip again, e.g. after the screens changed. */
  place: () => void;
  /** The width changed (in DIP): the reserved strip follows. */
  setWidth: (width: number) => void;
  /** Gives the strip back to Windows; call before the window closes. */
  remove: () => void;
}

/**
 * Makes `window` an app bar at the right edge of the display `displayOf` returns (asked again after every change of
 * the screens), `width` DIP wide, from the top of the screen to the taskbar. Windows moves it when the taskbar or other app bars change, and it steps back behind full-screen programs.
 */
export function attachAppBar(window: BrowserWindow, displayOf: () => Display, width: number, log: (line: string) => void): AppBar | null {
  const found = appBarMessage(log);
  if (!found) return null;
  const message: AppBarMessage = found;
  const handle = window.getNativeWindowHandle();
  const data: AppBarData = {
    cbSize: dataSize,
    hWnd: handle.length >= 8 ? handle.readBigUInt64LE(0) : BigInt(handle.readUInt32LE(0)),
    uCallbackMessage: CALLBACK_MESSAGE,
    uEdge: ABE_RIGHT,
    rc: { left: 0, top: 0, right: 0, bottom: 0 },
    lParam: 0n,
  };
  let currentWidth = width;
  let removed = false;
  try {
    message(ABM_NEW, data);
  } catch (error) {
    log(`App bar could not be registered: ${String(error)}`);
    return null;
  }

  /** Asks Windows for the strip (in physical pixels), takes it and puts the window there. */
  function place() {
    if (removed || window.isDestroyed()) return;
    const display = displayOf();
    const screenRect = screen.dipToScreenRect(null, display.bounds);
    const workRect = screen.dipToScreenRect(null, display.workArea);
    const physicalWidth = Math.round(currentWidth * display.scaleFactor);
    const right = screenRect.x + screenRect.width;
    data.uEdge = ABE_RIGHT;
    data.rc = { left: right - physicalWidth, top: workRect.y, right, bottom: workRect.y + workRect.height };
    message(ABM_QUERYPOS, data);
    data.rc = { ...data.rc, left: data.rc.right - physicalWidth };
    message(ABM_SETPOS, data);
    const bounds: Rectangle = screen.screenToDipRect(null, {
      x: data.rc.left,
      y: data.rc.top,
      width: data.rc.right - data.rc.left,
      height: data.rc.bottom - data.rc.top,
    });
    // Only a real change: moving the window makes Windows report the position again.
    const now = window.getBounds();
    if (now.x !== bounds.x || now.y !== bounds.y || now.width !== bounds.width || now.height !== bounds.height) window.setBounds(bounds);
  }

  window.hookWindowMessage(CALLBACK_MESSAGE, (wParam, lParam) => {
    const notification = wParam.readUInt32LE(0);
    if (notification === ABN_POSCHANGED) place();
    // A full-screen program (a video, a presentation) is in front: the bar steps back until it ends.
    if (notification === ABN_FULLSCREENAPP && !window.isDestroyed()) window.setAlwaysOnTop(lParam.readUInt32LE(0) === 0);
  });
  // Windows asks app bars to report these, so the taskbar keeps the right order.
  window.hookWindowMessage(WM_ACTIVATE, () => !removed && message(ABM_ACTIVATE, data));
  window.hookWindowMessage(WM_WINDOWPOSCHANGED, () => !removed && message(ABM_WINDOWPOSCHANGED, data));
  place();

  return {
    place,
    setWidth: (next) => {
      currentWidth = next;
      place();
    },
    remove: () => {
      if (removed) return;
      removed = true;
      try {
        message(ABM_REMOVE, data);
      } catch (error) {
        log(`App bar could not be removed: ${String(error)}`);
      }
      if (!window.isDestroyed()) {
        window.unhookWindowMessage(CALLBACK_MESSAGE);
        window.unhookWindowMessage(WM_ACTIVATE);
        window.unhookWindowMessage(WM_WINDOWPOSCHANGED);
      }
    },
  };
}
