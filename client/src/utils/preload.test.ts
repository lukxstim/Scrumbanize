import { describe, expect, it, vi } from 'vitest';
import { preloadInBackground } from './preload';

describe('preloadInBackground (US-29)', () => {
  it('loads the parts one after another while idle, once', async () => {
    vi.useFakeTimers();
    const order: string[] = [];
    const load = (name: string) => () => {
      order.push(name);
      return Promise.resolve();
    };
    preloadInBackground([load('editor'), load('analytics')]);
    preloadInBackground([load('again')]);
    await vi.runAllTimersAsync();
    expect(order).toEqual(['editor', 'analytics']);
    vi.useRealTimers();
  });
});
