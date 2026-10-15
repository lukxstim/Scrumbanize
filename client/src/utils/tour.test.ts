import { describe, expect, it } from 'vitest';
import { closedTourState, isTourState, placeCard, TOUR_STEPS } from './tour';

const viewport = { width: 1280, height: 800 };
const card = { width: 320, height: 200 };

describe('tour', () => {
  it('has 7 steps, the first one centered', () => {
    expect(TOUR_STEPS).toHaveLength(7);
    expect(TOUR_STEPS[0]!.target).toBeUndefined();
    expect(TOUR_STEPS.slice(1).every((s) => s.target)).toBe(true);
  });

  it('remembers "Nicht erneut anzeigen"', () => {
    const now = new Date('2026-10-15T10:00:00Z');
    expect(closedTourState(true, now)).toEqual({ status: 'done', at: '2026-10-15T10:00:00.000Z' });
    expect(closedTourState(false, now).status).toBe('later');
    expect(isTourState({ status: 'done' })).toBe(true);
    expect(isTourState({ status: 'maybe' })).toBe(false);
    expect(isTourState(null)).toBe(false);
  });

  it('places the card below the target, centered on it', () => {
    expect(placeCard({ top: 10, left: 500, width: 100, height: 30 }, card, viewport)).toEqual({
      top: 52,
      left: 390,
      side: 'below',
      arrowLeft: 160,
    });
  });

  it('keeps the card inside the window and points the arrow at the target', () => {
    const right = placeCard({ top: 10, left: 1240, width: 32, height: 32 }, card, viewport);
    expect(right.left).toBe(1280 - 320 - 16);
    expect(right.arrowLeft).toBe(320 - 16); // as close to the target as the card's rounded corner allows
    expect(placeCard({ top: 10, left: 0, width: 20, height: 20 }, card, viewport).left).toBe(16);
  });

  it('goes above when there is no room below, and to the middle without a target', () => {
    expect(placeCard({ top: 700, left: 500, width: 100, height: 40 }, card, viewport)).toMatchObject({ side: 'above', top: 488 });
    expect(placeCard(null, card, viewport)).toEqual({ top: 300, left: 480, side: 'center', arrowLeft: 0 });
  });
});
