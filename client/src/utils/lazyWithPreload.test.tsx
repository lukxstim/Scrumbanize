import { describe, expect, it, vi } from 'vitest';
import { lazyWithPreload } from './lazyWithPreload';

describe('lazyWithPreload (US-29)', () => {
  it('loads once, and again after a failed attempt', async () => {
    const Loaded = () => null;
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ default: Loaded });
    const Component = lazyWithPreload(load);
    await expect(Component.preload()).rejects.toThrow('offline');
    await expect(Component.preload()).resolves.toEqual({ default: Loaded });
    await Component.preload();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('renders the loaded component directly once preloaded', async () => {
    const Loaded = (props: { text: string }) => props.text;
    const Component = lazyWithPreload(() => Promise.resolve({ default: Loaded }));
    await Component.preload();
    // No lazy wrapper in between: the element is the loaded component itself.
    const element = Component({ text: 'hallo' }) as { type: unknown; props: { text: string } };
    expect(element.type).toBe(Loaded);
    expect(element.props.text).toBe('hallo');
  });
});
