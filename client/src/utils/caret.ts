// What a textarea's text looks like depends on these; the mirror copies them.
const MIRRORED = [
  'boxSizing', 'width', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'fontFamily', 'fontSize', 'fontWeight',
  'fontStyle', 'letterSpacing', 'lineHeight', 'textTransform', 'wordSpacing', 'tabSize', 'textIndent',
] as const;

/**
 * Where a position of a textarea's text is on screen (viewport coordinates, one line high). Textareas do not tell,
 * so an invisible copy with the same text and styles is measured.
 */
export function caretRect(textarea: HTMLTextAreaElement, position: number): DOMRect {
  const style = getComputedStyle(textarea);
  const mirror = document.createElement('div');
  for (const property of MIRRORED) mirror.style[property] = style[property];
  Object.assign(mirror.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', top: '0', left: '-9999px' });
  mirror.textContent = textarea.value.slice(0, position);
  const marker = document.createElement('span');
  marker.textContent = '​';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const box = textarea.getBoundingClientRect();
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4;
  const left = box.left + marker.offsetLeft - textarea.scrollLeft;
  const top = box.top + marker.offsetTop - textarea.scrollTop;
  mirror.remove();
  return new DOMRect(left, top, 1, lineHeight);
}
