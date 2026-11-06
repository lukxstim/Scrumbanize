import { describe, expect, it } from 'vitest';
import { dropPoint } from './linkDrop';

describe('dropPoint', () => {
  it('adds the distance moved to where the mouse went down', () => {
    expect(dropPoint({ activatorEvent: { clientX: 100, clientY: 40 }, delta: { x: 250, y: -10 } })).toEqual({ x: 350, y: 30 });
  });

  it('takes the finger for a touch drag', () => {
    expect(dropPoint({ activatorEvent: { touches: [{ clientX: 10, clientY: 20 }] }, delta: { x: 1, y: 2 } })).toEqual({ x: 11, y: 22 });
  });

  it('knows no point for a drag started otherwise, e.g. with the keyboard', () => {
    expect(dropPoint({ activatorEvent: { key: 'Enter' }, delta: { x: 5, y: 5 } })).toBeUndefined();
    expect(dropPoint({ activatorEvent: null, delta: { x: 5, y: 5 } })).toBeUndefined();
  });
});
