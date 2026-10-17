import fs from 'node:fs';
import { once } from 'node:events';
import type { Writable } from 'node:stream';
import { strToU8, Zip, ZipDeflate, ZipPassThrough } from 'fflate';

/**
 * Writes a ZIP archive into `out` entry by entry, waiting whenever `out` asks to (backpressure), so large files are
 * never held in memory. Call `end()` once; it resolves when everything was handed to `out` (and `out` was ended).
 */
export function createZipStream(out: Writable) {
  let failed: Error | null = null;
  const zip = new Zip((error, chunk, final) => {
    if (error) {
      failed = error;
      return;
    }
    out.write(chunk);
    if (final) out.end();
  });

  async function flush() {
    if (failed) throw failed;
    // A download the client aborted never drains; stop instead of waiting for good.
    if (out.writableNeedDrain && !out.destroyed) await Promise.race([once(out, 'drain'), once(out, 'close')]);
    if (out.destroyed) throw new Error('The output was closed before the archive was complete');
  }

  return {
    /** Small in-memory content, e.g. a manifest or a note. */
    async addText(name: string, text: string) {
      const entry = new ZipDeflate(name, { level: 6 });
      zip.add(entry);
      entry.push(strToU8(text), true);
      await flush();
    },

    /** A file from disk, streamed. Already compressed formats (images, PDFs …) are stored as they are. */
    async addFile(name: string, file: string, compress: boolean) {
      const entry = compress ? new ZipDeflate(name, { level: 6 }) : new ZipPassThrough(name);
      zip.add(entry);
      for await (const chunk of fs.createReadStream(file)) {
        entry.push(chunk as Uint8Array);
        await flush();
      }
      entry.push(new Uint8Array(0), true);
      await flush();
    },

    async end() {
      zip.end();
      await flush();
      if (!out.writableFinished) await Promise.race([once(out, 'finish'), once(out, 'close')]);
    },
  };
}

/** Text-like files get compressed; everything else is usually compressed already. */
export const isCompressible = (fileName: string) => /\.(txt|md|csv|json|xml|svg|html?|css|js|ts|log|db|sqlite)$/i.test(fileName);
