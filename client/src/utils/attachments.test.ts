import { describe, expect, it } from 'vitest';
import { canPreview, fileLabel, fileProblem, formatSize } from './attachments';

describe('attachments', () => {
  it('formats sizes in German', () => {
    expect(formatSize(830)).toBe('830 B');
    expect(formatSize(12_700)).toBe('12,4 KB');
    expect(formatSize(3.2 * 1024 * 1024)).toBe('3,2 MB');
  });

  it('checks files before uploading', () => {
    expect(fileProblem({ name: 'Plan.PDF', size: 10 })).toBeUndefined();
    expect(fileProblem({ name: 'logo.svg', size: 10 })).toBe('Dateityp nicht erlaubt');
    expect(fileProblem({ name: 'ohne-endung', size: 10 })).toBe('Dateityp nicht erlaubt');
    expect(fileProblem({ name: 'gross.zip', size: 25 * 1024 * 1024 + 1 })).toBe('größer als 25 MB');
  });

  it('previews images and PDFs only', () => {
    expect(canPreview({ mimeType: 'image/webp' })).toBe(true);
    expect(canPreview({ mimeType: 'application/pdf' })).toBe(true);
    expect(canPreview({ mimeType: 'application/zip' })).toBe(false);
    expect(fileLabel('Bericht.final.docx')).toBe('DOCX');
    expect(fileLabel('README')).toBe('Datei');
  });
});
