import { randomUUID } from 'crypto';
import multer from 'multer';
import path from 'path';
import { ENV } from '../config/env';
import { supabaseAdmin } from '../config/supabase';

export const MAX_DOCUMENT_FILE_SIZE_BYTES = 50 * 1024 * 1024;
export const MAX_MILESTONE_SUBMISSION_FILES = 10;
const allowedExtensions = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.png',
  '.jpg',
  '.jpeg',
  '.svg',
  '.zip',
  '.txt',
  '.json',
]);

export function isAllowedDocumentFileName(originalName: string): boolean {
  return allowedExtensions.has(path.extname(originalName).toLowerCase());
}

export function sanitizeStorageFileName(originalName: string): string {
  const extension = path.extname(originalName).toLowerCase();
  const baseName = path.basename(originalName, extension).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120) || 'document';
  return `${baseName}${extension}`;
}

export function buildDocumentStoragePath(projectId: string, documentId: string, originalName: string): string {
  return `${projectId}/${documentId}/${randomUUID()}-${sanitizeStorageFileName(originalName)}`;
}

export function buildMilestoneSubmissionStoragePath(
  projectId: string,
  milestoneId: string,
  packageId: string,
  originalName: string
): string {
  return `milestone-submissions/${projectId}/${milestoneId}/${packageId}/${randomUUID()}-${sanitizeStorageFileName(originalName)}`;
}

export function buildMilestoneContributionStoragePath(
  projectId: string,
  milestoneId: string,
  contributionId: string,
  originalName: string
): string {
  return `milestone-contributions/${projectId}/${milestoneId}/${contributionId}/${randomUUID()}-${sanitizeStorageFileName(originalName)}`;
}

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_DOCUMENT_FILE_SIZE_BYTES,
  },
  fileFilter: (_req, file, cb) => {
    if (isAllowedDocumentFileName(file.originalname)) {
      return cb(null, true);
    }
    cb(new Error('File format not supported. Allowed formats: PDF, DOCX, XLSX, PPTX, Images, ZIP.'));
  },
});

export class DocumentStorageService {
  private static get bucketName(): string {
    if (!ENV.SUPABASE_DOCUMENT_BUCKET.trim()) {
      throw new Error('Document storage is not configured.');
    }

    return ENV.SUPABASE_DOCUMENT_BUCKET;
  }

  static async upload(file: Express.Multer.File, storagePath: string): Promise<void> {
    const { error } = await supabaseAdmin.storage
      .from(this.bucketName)
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype || 'application/octet-stream',
        upsert: false,
      });

    if (error) {
      throw new Error('Failed to upload document file.');
    }
  }

  static async copy(sourcePath: string, destinationPath: string): Promise<void> {
    const { error } = await supabaseAdmin.storage
      .from(this.bucketName)
      .copy(sourcePath, destinationPath);

    if (error) {
      throw new Error('Failed to copy document file.');
    }
  }

  static async remove(storagePath: string): Promise<void> {
    const { error } = await supabaseAdmin.storage.from(this.bucketName).remove([storagePath]);

    if (error) {
      throw new Error('Failed to remove document file.');
    }
  }

  static async removeMany(storagePaths: string[]): Promise<void> {
    const uniquePaths = [...new Set(storagePaths.filter(Boolean))];
    if (!uniquePaths.length) return;

    const results = await Promise.allSettled(uniquePaths.map((storagePath) => this.remove(storagePath)));
    if (results.some((result) => result.status === 'rejected')) {
      throw new Error('Failed to remove one or more document files.');
    }
  }

  static async createSignedDownloadUrl(storagePath: string, expiresInSeconds = 300): Promise<string> {
    const { data, error } = await supabaseAdmin.storage
      .from(this.bucketName)
      .createSignedUrl(storagePath, expiresInSeconds);

    if (error || !data?.signedUrl) {
      throw new Error('Failed to create document download URL.');
    }

    return data.signedUrl;
  }
}
