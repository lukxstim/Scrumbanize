// Icons of the installable web app (US-25), made from the desktop app's icon: `npm run icons -w client`.
// The results in client/public are committed, so builds need no image tools.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(root, '..', 'desktop', 'build', 'icon.png');
const out = (name) => path.join(root, 'public', name);
const white = { r: 255, g: 255, b: 255, alpha: 1 };

/** The logo at `size`, shrunk by `scale` and centered on a white square: no transparency, nothing at the edges. */
async function onWhite(size, scale) {
  const inner = Math.round(size * scale);
  const logo = await sharp(source).resize(inner, inner).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: white } })
    .composite([{ input: logo, gravity: 'center' }])
    .flatten({ background: white })
    .png();
}

for (const size of [192, 512]) {
  await sharp(source).resize(size, size).png().toFile(out(`pwa-${size}x${size}.png`));
}
// Android crops maskable icons to a circle or squircle; the logo stays inside the safe zone (the middle 80 %).
await (await onWhite(512, 0.9)).toFile(out('maskable-icon-512x512.png'));
// iOS fills transparency with black.
await (await onWhite(180, 1)).toFile(out('apple-touch-icon-180x180.png'));
console.log('Icons written to client/public.');
