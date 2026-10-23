/**
 * A short vibration as feedback while dragging on a touch screen (US-25): when a card is picked up, when it moves
 * to another column, and when it is dropped. Only where the browser can vibrate (Android; iOS Safari cannot), and
 * never for the mouse or the keyboard.
 */
export type HapticKind = 'pickUp' | 'target' | 'drop';

const PATTERNS: Record<HapticKind, number | number[]> = { pickUp: 12, target: 6, drop: [8, 40, 8] };

/** Whether a drag was started by a finger: dnd-kit passes the event that activated it. */
export function isTouchActivation(event: Event | null | undefined): boolean {
  return typeof TouchEvent !== 'undefined' && event instanceof TouchEvent;
}

export function haptic(kind: HapticKind, nav: Pick<Navigator, 'vibrate'> | undefined = globalThis.navigator): boolean {
  if (typeof nav?.vibrate !== 'function') return false;
  try {
    return nav.vibrate(PATTERNS[kind]);
  } catch {
    // Some browsers refuse without a user gesture; the drag works without it.
    return false;
  }
}
