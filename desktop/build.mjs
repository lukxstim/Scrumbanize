// Bundles the Electron main process together with the server code into dist/main.cjs, and the window's preload
// script into dist/preload.cjs.
// Only electron and the native modules better-sqlite3 and koffi (the app bar of the quick notes, US-26) stay external; everything else (Express, Zod …) is
// inside the bundle, so the packaged app needs no other node_modules.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  external: ['electron', 'better-sqlite3', 'koffi'],
  sourcemap: 'linked',
  logLevel: 'info',
});

// The window runs sandboxed, so its preload script must be a single CommonJS file that only requires electron.
await build({
  entryPoints: ['src/preload.ts'],
  outfile: 'dist/preload.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  external: ['electron'],
  sourcemap: 'linked',
  logLevel: 'info',
});
