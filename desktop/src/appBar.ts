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

/** What pushing the other windows aside needs from user32 and dwmapi. */
interface WindowCalls {
  nextTopLevel: (parent: number, after: number | bigint, cls: null, name: null) => number | bigint;
  isVisible: (hWnd: number | bigint) => boolean;
  isWindow: (hWnd: number | bigint) => boolean;
  keyState: (key: number) => number;
  isMinimized: (hWnd: number | bigint) => boolean;
  isMaximized: (hWnd: number | bigint) => boolean;
  windowLong: (hWnd: number | bigint, index: number) => number | bigint;
  windowRect: (hWnd: number | bigint, rect: Partial<Rect>) => boolean;
  setWindowPos: (hWnd: number | bigint, after: number, x: number, y: number, cx: number, cy: number, flags: number) => boolean;
  frameRect: (hWnd: number | bigint, attribute: number, rect: Partial<Rect>, size: number) => number;
  cloaked: (hWnd: number | bigint, attribute: number, value: number[], size: number) => number;
  rectSize: number;
}

let windowCalls: WindowCalls | undefined;

const GWL_STYLE = -16;
const GWL_EXSTYLE = -20;
const WS_CHILD = 0x40000000;
const WS_CAPTION = 0x00c00000;
const WS_THICKFRAME = 0x00040000;
const WS_EX_TOPMOST = 0x00000008;
const WS_EX_TOOLWINDOW = 0x00000080;
const WS_EX_NOACTIVATE = 0x08000000;
const DWMWA_EXTENDED_FRAME_BOUNDS = 9;
const DWMWA_CLOAKED = 14;
const SWP_NOSIZE = 0x0001;
const SWP_NOZORDER = 0x0004;
const SWP_NOACTIVATE = 0x0010;
const SWP_NOOWNERZORDER = 0x0200;
const VK_LBUTTON = 0x01;
/** How often windows that came into the strip (opened, restored, dropped there) are pushed out again. */
const WATCH_MS = 1000;
/** Narrower than this, a window is moved but not squeezed any further. */
const MIN_PUSHED_WIDTH = 240;

/**
 * Where a window goes so it ends left of the strip (US-26): moved left, and made narrower only if it does not fit
 * between the left edge of the work area and the strip. `frame` is its visible frame, `outer` its window rectangle
 * (with the invisible resize borders), all in physical pixels. Null if it does not reach into the strip.
 */
export function pushedAside(frame: Rect, outer: Rect, strip: Rect, workLeft: number): Rect | null {
  const overlaps = frame.right > strip.left && frame.left < strip.right && frame.bottom > strip.top && frame.top < strip.bottom;
  if (!overlaps) return null;
  const width = frame.right - frame.left;
  const left = Math.max(workLeft, Math.min(frame.left, strip.left - width));
  const right = Math.max(left + Math.min(width, MIN_PUSHED_WIDTH), Math.min(strip.left, left + width));
  return {
    left: left - (frame.left - outer.left),
    top: outer.top,
    right: right + (outer.right - frame.right),
    bottom: outer.bottom,
  };
}

/**
 * A window this app moved out of the strip: where it was, and where it was put. Closing the panel puts it back, if it
 * is still where it was put.
 */
interface PushedWindow {
  hWnd: number | bigint;
  before: Rect;
  after: Rect;
}

const sameRect = (a: Rect, b: Rect) => a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom;

/**
 * Moves every ordinary window that reaches into the strip out of it, like the docked Windows Sticky Notes: Windows
 * itself only fits maximised windows into the rest of the screen. Minimised, maximised, hidden, tool and always-on-top
 * windows stay; windows of programs running as administrator cannot be moved and stay, too. Returns the moved ones.
 */
function pushWindowsAside(own: number | bigint, strip: Rect, workLeft: number, log: (line: string) => void): PushedWindow[] {
  const calls = windowCalls;
  const moved: PushedWindow[] = [];
  if (!calls) return moved;
  // A window being dragged (or resized) is left alone until the mouse button is let go.
  if (calls.keyState(VK_LBUTTON) & 0x8000) return moved;
  try {
    let hWnd: number | bigint = 0;
    for (let guard = 0; guard < 5000; guard++) {
      hWnd = calls.nextTopLevel(0, hWnd, null, null);
      if (!hWnd) break;
      if (BigInt(hWnd) === BigInt(own) || !calls.isVisible(hWnd) || calls.isMinimized(hWnd) || calls.isMaximized(hWnd)) continue;
      const style = Number(BigInt.asUintN(32, BigInt(calls.windowLong(hWnd, GWL_STYLE))));
      const exStyle = Number(BigInt.asUintN(32, BigInt(calls.windowLong(hWnd, GWL_EXSTYLE))));
      if (style & WS_CHILD || ((style & WS_CAPTION) !== WS_CAPTION && !(style & WS_THICKFRAME))) continue;
      if (exStyle & (WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TOPMOST)) continue;
      const cloaked = [0];
      if (calls.cloaked(hWnd, DWMWA_CLOAKED, cloaked, 4) === 0 && cloaked[0]) continue;
      const outer: Partial<Rect> = {};
      if (!calls.windowRect(hWnd, outer)) continue;
      const frame: Partial<Rect> = {};
      const visible = calls.frameRect(hWnd, DWMWA_EXTENDED_FRAME_BOUNDS, frame, calls.rectSize) === 0 ? (frame as Rect) : (outer as Rect);
      const target = pushedAside(visible, outer as Rect, strip, workLeft);
      if (!target || sameRect(target, outer as Rect)) continue;
      if (moveWindow(hWnd, outer as Rect, target)) moved.push({ hWnd, before: { ...(outer as Rect) }, after: target });
    }
  } catch (error) {
    log(`Windows could not be pushed aside: ${String(error)}`);
  }
  return moved;
}

/** Puts a window at `target` (physical pixels), without bringing it to the front. */
function moveWindow(hWnd: number | bigint, now: Rect, target: Rect): boolean {
  const calls = windowCalls!;
  const sameSize = target.right - target.left === now.right - now.left && target.bottom - target.top === now.bottom - now.top;
  const flags = SWP_NOZORDER | SWP_NOACTIVATE | SWP_NOOWNERZORDER | (sameSize ? SWP_NOSIZE : 0);
  return calls.setWindowPos(hWnd, 0, target.left, target.top, target.right - target.left, target.bottom - target.top, flags);
}

/** Puts the pushed windows back where they were, unless they were moved, maximised or closed since. */
function putBack(pushed: Map<string, PushedWindow>, log: (line: string) => void): void {
  const calls = windowCalls;
  if (!calls) return;
  for (const window of pushed.values()) {
    try {
      if (!calls.isWindow(window.hWnd) || calls.isMinimized(window.hWnd) || calls.isMaximized(window.hWnd)) continue;
      const now: Partial<Rect> = {};
      if (calls.windowRect(window.hWnd, now) && sameRect(now as Rect, window.after)) moveWindow(window.hWnd, now as Rect, window.before);
    } catch (error) {
      log(`A window could not be put back: ${String(error)}`);
    }
  }
  pushed.clear();
}

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
    try {
      const user32 = koffi.load('user32.dll');
      const dwmapi = koffi.load('dwmapi.dll');
      windowCalls = {
        nextTopLevel: user32.func('uintptr_t __stdcall FindWindowExW(uintptr_t parent, uintptr_t after, const char16_t *cls, const char16_t *name)') as WindowCalls['nextTopLevel'],
        isVisible: user32.func('bool __stdcall IsWindowVisible(uintptr_t hWnd)') as WindowCalls['isVisible'],
        isWindow: user32.func('bool __stdcall IsWindow(uintptr_t hWnd)') as WindowCalls['isWindow'],
        keyState: user32.func('int16_t __stdcall GetAsyncKeyState(int key)') as WindowCalls['keyState'],
        isMinimized: user32.func('bool __stdcall IsIconic(uintptr_t hWnd)') as WindowCalls['isMinimized'],
        isMaximized: user32.func('bool __stdcall IsZoomed(uintptr_t hWnd)') as WindowCalls['isMaximized'],
        windowLong: user32.func('intptr_t __stdcall GetWindowLongPtrW(uintptr_t hWnd, int index)') as WindowCalls['windowLong'],
        windowRect: user32.func('bool __stdcall GetWindowRect(uintptr_t hWnd, _Out_ ScrumbanizeRECT *rect)') as WindowCalls['windowRect'],
        setWindowPos: user32.func(
          'bool __stdcall SetWindowPos(uintptr_t hWnd, uintptr_t after, int x, int y, int cx, int cy, uint32_t flags)',
        ) as WindowCalls['setWindowPos'],
        // The same function twice, once per kind of answer: the visible frame (a RECT) and whether it is cloaked.
        frameRect: dwmapi.func('__stdcall', 'DwmGetWindowAttribute', 'int32_t', [
          'uintptr_t',
          'uint32_t',
          koffi.out(koffi.pointer(rect)),
          'uint32_t',
        ]) as WindowCalls['frameRect'],
        cloaked: dwmapi.func('__stdcall', 'DwmGetWindowAttribute', 'int32_t', [
          'uintptr_t',
          'uint32_t',
          koffi.out(koffi.pointer('uint32_t')),
          'uint32_t',
        ]) as WindowCalls['cloaked'],
        rectSize: koffi.sizeof(rect),
      };
    } catch (error) {
      log(`Windows cannot be pushed aside: ${String(error)}`);
    }
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
  /** Gives the strip back to Windows and puts pushed windows back; call when the window closes (more than once is fine). */
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
  // The windows moved out of the strip, by their handle; put back when the panel closes.
  const pushed = new Map<string, PushedWindow>();
  let strip: Rect | null = null;
  let workLeft = 0;
  const push = () => {
    if (removed || !strip || window.isDestroyed() || !window.isVisible()) return;
    for (const moved of pushWindowsAside(data.hWnd, strip, workLeft, log)) {
      const key = String(moved.hWnd);
      // Moved again: it goes back to where it was before the first time.
      pushed.set(key, { ...moved, before: pushed.get(key)?.before ?? moved.before });
    }
  };
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
    strip = { ...data.rc };
    workLeft = workRect.x;
    push();
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
  // Windows that come into the strip later (opened, restored, dropped there) are pushed out, too.
  const watch = setInterval(push, WATCH_MS);
  window.once('show', push);

  return {
    place,
    setWidth: (next) => {
      currentWidth = next;
      place();
    },
    remove: () => {
      if (removed) return;
      removed = true;
      clearInterval(watch);
      try {
        message(ABM_REMOVE, data);
      } catch (error) {
        log(`App bar could not be removed: ${String(error)}`);
      }
      putBack(pushed, log);
      if (!window.isDestroyed()) {
        window.unhookWindowMessage(CALLBACK_MESSAGE);
        window.unhookWindowMessage(WM_ACTIVATE);
        window.unhookWindowMessage(WM_WINDOWPOSCHANGED);
      }
    },
  };
}
