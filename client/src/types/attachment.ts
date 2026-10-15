export interface Attachment {
  id: number;
  /** The original file name. */
  fileName: string;
  mimeType: string;
  /** Bytes. */
  size: number;
  createdAt: string;
}

export type AttachmentOwner = { type: 'note' | 'task'; id: number };
