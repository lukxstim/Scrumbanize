import path from 'node:path';

/** Upload limits. */
export const MAX_FILE_SIZE = 25 * 1024 * 1024;
export const MAX_FILES_PER_UPLOAD = 10;

/**
 * Allowed file types by extension, with the type the server sends them as. The browser's own claim is
 * ignored. SVG is left out on purpose: it can carry scripts.
 */
export const FILE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
  '.odp': 'application/vnd.oasis.opendocument.presentation',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.zip': 'application/zip',
};

/** Types the browser may show itself (in an <img> or the PDF viewer); everything else is downloaded. */
const INLINE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf']);

/** The lower-case extension of a file name, or "" if there is none. */
export function extensionOf(fileName: string): string {
  return path.extname(fileName).toLowerCase();
}

export function mimeTypeOf(fileName: string): string | undefined {
  return FILE_TYPES[extensionOf(fileName)];
}

export const isInline = (mimeType: string) => INLINE_TYPES.has(mimeType);

/**
 * A Content-Disposition header that keeps non-ASCII names (RFC 6266/5987): a plain fallback for old clients
 * and the exact UTF-8 name.
 */
export function contentDisposition(kind: 'inline' | 'attachment', fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/**
 * Multer reads the name of an uploaded file as Latin-1 although browsers send UTF-8, so "Übersicht.pdf"
 * arrives as "Ã\u009cbersicht.pdf". This turns it back.
 */
export function decodeUploadName(name: string): string {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? name : decoded;
}
