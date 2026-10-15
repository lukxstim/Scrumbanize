import { randomUUID } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import {
  contentDisposition,
  decodeUploadName,
  extensionOf,
  isInline,
  MAX_FILE_SIZE,
  MAX_FILES_PER_UPLOAD,
  mimeTypeOf,
} from '../attachmentFiles.js';
import { HttpError, notFound } from '../errors.js';
import type { AttachmentOwner, AttachmentsRepository } from '../repositories/attachmentsRepository.js';
import { idParamSchema } from '../validation.js';

/** Uploads to notes and tasks, and the files themselves. Mounted at /api. */
export function attachmentsRouter(attachments: AttachmentsRepository): Router {
  const router = Router();

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, done) => {
        attachments.ensureFolders();
        done(null, attachments.incomingDir);
      },
      // A random name on disk; the original one is only kept in the database.
      filename: (_req, file, done) => done(null, `${randomUUID()}${extensionOf(decodeUploadName(file.originalname))}`),
    }),
    limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES_PER_UPLOAD },
    fileFilter: (_req, file, done) => {
      const name = decodeUploadName(file.originalname);
      if (mimeTypeOf(name)) done(null, true);
      else done(new HttpError(415, 'unsupported_type', `File type not allowed: ${name}`));
    },
  }).array('files', MAX_FILES_PER_UPLOAD);

  /** Runs multer and turns its errors into API errors. */
  const receive: RequestHandler = (req, res, next) => {
    upload(req, res, (error: unknown) => {
      if (!error) return next();
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, 'file_too_large', 'A file is larger than 25 MB'));
        if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
          return next(new HttpError(400, 'too_many_files', `At most ${MAX_FILES_PER_UPLOAD} files per upload`));
        }
        return next(new HttpError(400, 'invalid_upload', error.message));
      }
      next(error);
    });
  };

  const handleUpload =
    (type: AttachmentOwner['type']): RequestHandler[] => [
      // Refuse before reading the body, so nothing is written for a missing note or task.
      (req, _res, next) => {
        if (!attachments.ownerExists({ type, id: idParamSchema.parse(req.params.id) })) throw notFound(`${type} not found`);
        next();
      },
      receive,
      (req, res) => {
        const files = (req.files as Express.Multer.File[] | undefined) ?? [];
        if (files.length === 0) throw new HttpError(400, 'no_files', 'No files in field "files"');
        const added = attachments.add(
          { type, id: idParamSchema.parse(req.params.id) },
          files.map((f) => {
            const fileName = decodeUploadName(f.originalname);
            return { fileName, storedName: f.filename, mimeType: mimeTypeOf(fileName)!, size: f.size };
          }),
        );
        if (!added) throw notFound(`${type} not found`);
        res.status(201).json(added);
      },
    ];

  router.post('/notes/:id/attachments', ...handleUpload('note'));
  router.post('/tasks/:id/attachments', ...handleUpload('task'));

  /**
   * The file itself. Images and PDFs may be shown by the browser, everything else is downloaded; `?download=1`
   * always downloads. Nothing is ever run as a page of the app (nosniff, and a sandbox except for PDFs, whose
   * viewer does not work in a sandbox).
   */
  router.get('/attachments/:id/file', (req, res) => {
    const found = attachments.file(idParamSchema.parse(req.params.id));
    if (!found) throw notFound('Attachment not found');
    const { attachment } = found;
    const inline = isInline(attachment.mimeType) && req.query.download === undefined;
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Disposition', contentDisposition(inline ? 'inline' : 'attachment', attachment.fileName));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (attachment.mimeType !== 'application/pdf') res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.sendFile(found.path, (error) => {
      if (error && !res.headersSent) res.status(404).json({ error: { code: 'not_found', message: 'File missing' } });
    });
  });

  router.delete('/attachments/:id', (req, res) => {
    if (!attachments.remove(idParamSchema.parse(req.params.id))) throw notFound('Attachment not found');
    res.status(204).end();
  });

  return router;
}
