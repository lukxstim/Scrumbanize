// Bundles the Electron main process together with the server code into dist/main.cjs.
// Only electron and better-sqlite3 (a native module) stay external; everything else (Express, Zod …) is
// inside the bundle, so the packaged app needs no other node_modules.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  external: ['electron', 'better-sqlite3'],
  sourcemap: 'linked',
  logLevel: 'info',
});
