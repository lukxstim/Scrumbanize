import { lazy, type ComponentProps, type ComponentType } from 'react';

/**
 * Like React's `lazy`, plus `preload` (US-29). A plain lazy component suspends on its first render even when its file
 * was fetched long before, and React then reveals it no earlier than 300 ms after showing the fallback: the first note
 * waited for that. Once preloaded (or loaded once), this component renders the loaded one directly, without suspending.
 * `preload` resolves to the whole module, so its other exports (say a warm-up) can be used, too.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a component type of any props, like React.lazy.
export function lazyWithPreload<M extends { default: ComponentType<any> }>(load: () => Promise<M>) {
  type Props = ComponentProps<M['default']>;
  let loaded: ComponentType<Props> | undefined;
  let pending: Promise<M> | undefined;
  const preload = (): Promise<M> => {
    pending ??= load().then(
      (module) => {
        loaded = module.default;
        return module;
      },
      (error: unknown) => {
        // A failed download (offline, a new version deployed meanwhile) may be tried again later.
        pending = undefined;
        throw error;
      },
    );
    return pending;
  };
  const Lazy = lazy(preload) as unknown as ComponentType<Props>;
  function Preloadable(props: Props) {
    const Component = loaded ?? Lazy;
    return <Component {...props} />;
  }
  return Object.assign(Preloadable, { preload });
}
