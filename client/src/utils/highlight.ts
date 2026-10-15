/** Highlight colors; the actual colors are theme tokens in index.css (mark[data-color=…]), so they work in dark mode. */
export const HIGHLIGHT_COLORS = [
  { value: 'yellow', label: 'Gelb' },
  { value: 'green', label: 'Grün' },
  { value: 'blue', label: 'Blau' },
  { value: 'pink', label: 'Rosa' },
  { value: 'orange', label: 'Orange' },
] as const;

export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number]['value'];

/**
 * Markdown the editor cannot show without losing something: raw HTML other than our highlights, footnotes,
 * and HTML comments. Such content opens in the Markdown source view instead.
 */
export function needsSourceMode(markdown: string): boolean {
  const withoutCode = markdown.replace(/^(```|~~~)[\s\S]*?^\1/gm, '').replace(/`[^`\n]*`/g, '');
  return (
    /<(?!mark data-color="(?:yellow|green|blue|pink|orange)">|\/mark>)\/?[a-z][a-z0-9-]*(\s[^>]*)?\/?>/i.test(withoutCode) ||
    /<!--/.test(withoutCode) ||
    /\[\^[^\]\n]+\]/.test(withoutCode)
  );
}
