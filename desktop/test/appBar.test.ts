import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ screen: {} }));
const { pushedAside } = await import('../src/appBar.js');

// A 1920 px wide screen with the strip of the quick notes at its right edge.
const strip = { left: 1580, top: 0, right: 1920, bottom: 1040 };
const rect = (left: number, right: number, top = 100, bottom = 800) => ({ left, top, right, bottom });

describe('pushedAside (US-26)', () => {
  it('leaves windows alone that do not reach into the strip', () => {
    expect(pushedAside(rect(100, 1580), rect(93, 1587), strip, 0)).toBeNull();
  });

  it('moves a window left until it ends at the strip, keeping its size and invisible borders', () => {
    expect(pushedAside(rect(1000, 1800), rect(993, 1807), strip, 0)).toEqual({ left: 773, top: 100, right: 1587, bottom: 800 });
    // Entirely inside the strip.
    expect(pushedAside(rect(1600, 1900), rect(1600, 1900), strip, 0)).toEqual(rect(1280, 1580));
  });

  it('makes a window narrower that does not fit beside the strip', () => {
    expect(pushedAside(rect(0, 1920), rect(0, 1920), strip, 0)).toEqual(rect(0, 1580));
  });
});
