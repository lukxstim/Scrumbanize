import type { Attachment } from '../types/attachment';

/** Keep in sync with server/src/attachmentFiles.ts. */
export const MAX_FILE_SIZE = 25 * 1024 * 1024;
export const MAX_FILES_PER_UPLOAD = 10;
export const ALLOWED_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.docx', '.xlsx', '.pptx', '.odt', '.ods', '.odp', '.txt', '.csv', '.md', '.zip',
];

/** For the file picker's `accept`. */
export const ACCEPT = ALLOWED_EXTENSIONS.join(',');

export const fileUrl = (id: number, download = false) => `/api/attachments/${id}/file${download ? '?download=1' : ''}`;

export const isImage = (a: Pick<Attachment, 'mimeType'>) => a.mimeType.startsWith('image/');
export const isPdf = (a: Pick<Attachment, 'mimeType'>) => a.mimeType === 'application/pdf';
/** Images and PDFs open in the app's preview; other files are downloaded. */
export const canPreview = (a: Pick<Attachment, 'mimeType'>) => isImage(a) || isPdf(a);

const sizeFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

/** "830 B", "12,4 KB", "3,2 MB" */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${sizeFormat.format(bytes / 1024)} KB`;
  return `${sizeFormat.format(bytes / 1024 / 1024)} MB`;
}

/** Why a file cannot be uploaded, checked before sending; undefined if it is fine. */
export function fileProblem(file: { name: string; size: number }): string | undefined {
  const dot = file.name.lastIndexOf('.');
  const extension = dot === -1 ? '' : file.name.slice(dot).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(extension)) return 'Dateityp nicht erlaubt';
  if (file.size > MAX_FILE_SIZE) return 'größer als 25 MB';
  return undefined;
}

/** "PDF", "DOCX", … for the file icon. */
export function fileLabel(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? 'Datei' : fileName.slice(dot + 1).toUpperCase().slice(0, 4);
}
