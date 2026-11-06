import type { Attachment } from '../types/attachment';

/**
 * Diagrams (US-32) are drawn in diagrams.net, embedded in its "embed" mode, and kept as an attachment of the note or
 * task: a PNG picture that carries the diagram itself (draw.io's "Editable PNG"). It shows like any other picture and
 * opens again for editing; SVG stays out, since it can carry scripts.
 */
export const DRAWIO_ORIGIN = 'https://embed.diagrams.net';

/** The editor in embed mode: messages as JSON, German, with "Speichern & Schließen". */
export const DRAWIO_URL = `${DRAWIO_ORIGIN}/?embed=1&proto=json&spin=1&libraries=1&saveAndExit=1&noSaveBtn=1&lang=de&ui=kennedy`;

/** How diagram files end; the PNG part makes the server and the browser treat them as pictures. */
export const DIAGRAM_SUFFIX = '.drawio.png';

export const isDiagram = (attachment: Pick<Attachment, 'fileName' | 'mimeType'>) =>
  attachment.mimeType === 'image/png' && attachment.fileName.toLowerCase().endsWith(DIAGRAM_SUFFIX);

/** "Ablauf.drawio.png" → "Ablauf". */
export const diagramName = (fileName: string) =>
  fileName.toLowerCase().endsWith(DIAGRAM_SUFFIX) ? fileName.slice(0, -DIAGRAM_SUFFIX.length) : fileName;

/** A name not used by the other diagrams yet: "Diagramm", "Diagramm 2", … */
export function newDiagramName(existing: string[]): string {
  const taken = new Set(existing.map((name) => diagramName(name).toLowerCase()));
  if (!taken.has('diagramm')) return 'Diagramm';
  let n = 2;
  while (taken.has(`diagramm ${n}`)) n++;
  return `Diagramm ${n}`;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * The diagram inside a PNG saved by draw.io: a tEXt chunk with the keyword "mxfile" whose text is the URL-encoded
 * XML. Undefined for other pictures.
 */
export function diagramXmlFromPng(bytes: Uint8Array): string | undefined {
  if (bytes.length < 8 || PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const latin1 = new TextDecoder('latin1');
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = latin1.decode(bytes.subarray(offset + 4, offset + 8));
    const start = offset + 8;
    if (start + length > bytes.length) return undefined;
    if (type === 'tEXt') {
      const data = bytes.subarray(start, start + length);
      const zero = data.indexOf(0);
      if (zero > 0 && latin1.decode(data.subarray(0, zero)) === 'mxfile') {
        try {
          return decodeURIComponent(latin1.decode(data.subarray(zero + 1)));
        } catch {
          return undefined;
        }
      }
    }
    if (type === 'IEND') return undefined;
    offset = start + length + 4; // data and CRC
  }
  return undefined;
}

/** A data: URI (as draw.io exports) as a Blob. */
export function dataUriToBlob(uri: string): Blob {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(uri);
  if (!match) throw new Error('Not a data URI');
  const [, type = 'application/octet-stream', base64, data = ''] = match;
  if (!base64) return new Blob([decodeURIComponent(data)], { type });
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}
