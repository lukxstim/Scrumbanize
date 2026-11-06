/**
 * Color themes and backgrounds (US-30), remembered per browser like the light/dark choice. The palette sets
 * `data-palette` on <html> (index.css redefines the accent colors for it), a background sets `data-background` and the
 * CSS variable --app-background. The inline script in index.html applies both before the first paint; keep the keys
 * and attribute names in sync with it.
 */

export const APPEARANCE_KEY = 'scrumbanize.appearance';
/** The own background image as a data URL; kept apart, it is much larger than the rest. */
export const CUSTOM_BACKGROUND_KEY = 'scrumbanize.background';
/** The CSS of the chosen example background, for the inline script, which does not know the examples. */
export const PRESET_CSS_KEY = 'scrumbanize.backgroundCss';

export const PALETTES = [
  { id: 'indigo', label: 'Indigo', swatch: 'bg-indigo-500' },
  { id: 'blue', label: 'Blau', swatch: 'bg-blue-500' },
  { id: 'teal', label: 'Türkis', swatch: 'bg-teal-500' },
  { id: 'green', label: 'Grün', swatch: 'bg-emerald-500' },
  { id: 'amber', label: 'Bernstein', swatch: 'bg-amber-500' },
  { id: 'rose', label: 'Rose', swatch: 'bg-rose-500' },
  { id: 'violet', label: 'Violett', swatch: 'bg-violet-500' },
  { id: 'graphite', label: 'Graphit', swatch: 'bg-zinc-600' },
] as const;
export type PaletteId = (typeof PALETTES)[number]['id'];

/** Example backgrounds, drawn by CSS: no image files to load. */
export const PRESET_BACKGROUNDS = [
  {
    id: 'dawn',
    label: 'Morgenrot',
    css: 'linear-gradient(135deg, #fbc2eb 0%, #f6d5a8 45%, #a6c1ee 100%)',
  },
  {
    id: 'ocean',
    label: 'Ozean',
    css: 'radial-gradient(ellipse at 20% 10%, #7dd3fc 0%, transparent 55%), radial-gradient(ellipse at 85% 90%, #6366f1 0%, transparent 55%), linear-gradient(160deg, #0ea5e9, #1e3a8a)',
  },
  {
    id: 'forest',
    label: 'Wald',
    css: 'radial-gradient(ellipse at 80% 0%, #bef264 0%, transparent 50%), linear-gradient(170deg, #34d399 0%, #065f46 100%)',
  },
  {
    id: 'mist',
    label: 'Nebel',
    css: 'radial-gradient(circle at 15% 20%, #e0e7ff 0%, transparent 40%), radial-gradient(circle at 85% 30%, #fce7f3 0%, transparent 40%), radial-gradient(circle at 50% 90%, #dcfce7 0%, transparent 45%), linear-gradient(#f4f4f5, #e4e4e7)',
  },
  {
    id: 'dots',
    label: 'Punkte',
    css: 'radial-gradient(circle, rgb(113 113 122 / 0.35) 1px, transparent 1.5px) 0 0 / 22px 22px, linear-gradient(#f4f4f5, #e4e4e7)',
  },
] as const;
export type PresetBackgroundId = (typeof PRESET_BACKGROUNDS)[number]['id'];

export type BackgroundChoice = { kind: 'none' } | { kind: 'preset'; id: PresetBackgroundId } | { kind: 'custom' };

export interface Appearance {
  palette: PaletteId;
  background: BackgroundChoice;
}

export const DEFAULT_APPEARANCE: Appearance = { palette: 'indigo', background: { kind: 'none' } };

const isPalette = (value: unknown): value is PaletteId => PALETTES.some((p) => p.id === value);
const isPreset = (value: unknown): value is PresetBackgroundId => PRESET_BACKGROUNDS.some((b) => b.id === value);

export function isAppearance(value: unknown): value is Appearance {
  if (typeof value !== 'object' || value === null) return false;
  const { palette, background } = value as Record<string, unknown>;
  if (!isPalette(palette) || typeof background !== 'object' || background === null) return false;
  const { kind, id } = background as Record<string, unknown>;
  return kind === 'none' || kind === 'custom' || (kind === 'preset' && isPreset(id));
}

/** The CSS background for a choice; null for none, or an own image that is missing. */
export function backgroundCss(choice: BackgroundChoice, customImage: string | null): string | null {
  if (choice.kind === 'preset') return PRESET_BACKGROUNDS.find((b) => b.id === choice.id)?.css ?? null;
  if (choice.kind === 'custom' && customImage) return `center / cover no-repeat url("${customImage}")`;
  return null;
}

/** Puts the palette and the background on <html>. */
export function applyAppearance(appearance: Appearance, customImage: string | null, root: HTMLElement = document.documentElement): void {
  if (appearance.palette === 'indigo') delete root.dataset.palette;
  else root.dataset.palette = appearance.palette;
  const css = backgroundCss(appearance.background, customImage);
  try {
    if (appearance.background.kind === 'preset' && css) localStorage.setItem(PRESET_CSS_KEY, css);
    else localStorage.removeItem(PRESET_CSS_KEY);
  } catch {
    // Without storage the background still shows; the next page load just starts without it.
  }
  if (css) {
    root.dataset.background = appearance.background.kind;
    root.style.setProperty('--app-background', css);
  } else {
    delete root.dataset.background;
    root.style.removeProperty('--app-background');
  }
}

/** Longest side of an own background after scaling, and the largest data URL kept (localStorage holds about 5 MB). */
export const MAX_BACKGROUND_SIDE = 1920;
export const MAX_BACKGROUND_CHARS = 2_500_000;

/** The size an image of `width` × `height` is scaled to: at most MAX_BACKGROUND_SIDE on its longer side, never up. */
export function scaledSize(width: number, height: number, max = MAX_BACKGROUND_SIDE): { width: number; height: number } {
  const factor = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * factor)), height: Math.max(1, Math.round(height * factor)) };
}

/** An image file as a scaled-down JPEG data URL, small enough for the browser's storage. */
export async function backgroundFromFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('not_an_image');
  const bitmap = await createImageBitmap(file);
  const { width, height } = scaledSize(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  for (const quality of [0.85, 0.7, 0.55]) {
    const url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= MAX_BACKGROUND_CHARS) return url;
  }
  throw new Error('too_large');
}
