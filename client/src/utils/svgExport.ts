/** Exporting an on-screen SVG as a standalone .svg or .png file. */

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Browsers refuse canvases much larger than this per side. */
const MAX_CANVAS_SIDE = 16_384;

let fontCss: Promise<string> | undefined;

/**
 * The app's font (Latin subset) as an embedded @font-face rule. An SVG drawn into a canvas, or opened outside the
 * app, cannot load the web font, so text would fall back to another font with other widths.
 */
function embeddedFontCss(): Promise<string> {
  fontCss ??= (async () => {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue; // a sheet from another origin
      }
      for (const rule of Array.from(rules)) {
        if (!(rule instanceof CSSFontFaceRule)) continue;
        const family = rule.style.getPropertyValue('font-family');
        const range = rule.style.getPropertyValue('unicode-range');
        if (!family.includes('Inter Variable') || !/U\+0+-0*FF\b/i.test(range)) continue;
        const url = /url\(["']?([^"')]+)["']?\)/.exec(rule.style.getPropertyValue('src'))?.[1];
        if (!url) continue;
        const blob = await (await fetch(new URL(url, sheet.href ?? document.baseURI))).blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        return `@font-face{font-family:'Inter Variable';font-weight:100 900;src:url(${dataUrl}) format('woff2');}`;
      }
    }
    return '';
  })().catch(() => '');
  return fontCss;
}

export interface ExportFrame {
  /** The area to export, in the SVG's own coordinates. */
  x: number;
  y: number;
  width: number;
  height: number;
  background: string;
}

/**
 * A standalone SVG document of `svg`: the content's group (`[data-export-content]`) without the current zoom and pan,
 * framed to `frame`, on a background, with the font embedded. Colors must already be concrete values, not CSS variables.
 */
export async function serializeSvg(svg: SVGSVGElement, frame: ExportFrame): Promise<string> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelector('[data-export-content]')?.removeAttribute('transform');
  clone.querySelectorAll('[data-export-ignore]').forEach((el) => el.remove());
  clone.removeAttribute('class');
  clone.removeAttribute('style');
  clone.setAttribute('xmlns', SVG_NS);
  clone.setAttribute('viewBox', `${frame.x} ${frame.y} ${frame.width} ${frame.height}`);
  clone.setAttribute('width', String(Math.ceil(frame.width)));
  clone.setAttribute('height', String(Math.ceil(frame.height)));

  const style = document.createElementNS(SVG_NS, 'style');
  style.textContent = await embeddedFontCss();
  const background = document.createElementNS(SVG_NS, 'rect');
  for (const [key, value] of Object.entries({ x: frame.x, y: frame.y, width: frame.width, height: frame.height, fill: frame.background })) {
    background.setAttribute(key, String(value));
  }
  clone.prepend(style, background);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

/** Renders an SVG document into a PNG at `scale` times its size (less if the canvas would get too large). */
export async function svgToPng(svgText: string, width: number, height: number, scale = 2): Promise<Blob> {
  const factor = Math.min(scale, MAX_CANVAS_SIDE / width, MAX_CANVAS_SIDE / height);
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * factor);
    canvas.height = Math.round(height * factor);
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Saves a file through the browser's download (the desktop app asks where to save it). */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the download a moment to start before the URL goes away.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
