import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ENV } from '../config/env';

// Ensure local upload directory exists
const uploadRoot = path.resolve(process.cwd(), ENV.UPLOAD_DIR);
if (!fs.existsSync(uploadRoot)) {
  fs.mkdirSync(uploadRoot, { recursive: true });
}

// Multer Disk Storage for file handling
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadRoot);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${baseName}-${uniqueSuffix}${ext}`);
  },
});

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB max file size
  },
  fileFilter: (_req, file, cb) => {
    // Allowed file types: PDF, Word, Excel, PowerPoint, Images, ZIP, Text
    const allowedExtensions = /pdf|docx|doc|xlsx|xls|pptx|ppt|png|jpg|jpeg|svg|zip|txt|json/;
    const extName = allowedExtensions.test(path.extname(file.originalname).toLowerCase());
    if (extName) {
      return cb(null, true);
    }
    cb(new Error('File format not supported. Allowed formats: PDF, DOCX, XLSX, PPTX, Images, ZIP.'));
  },
});

export class StorageService {
  /**
   * Get public or stream URL for a file
   */
  static getFileUrl(fileName: string): string {
    if (ENV.STORAGE_DRIVER === 's3') {
      return `${ENV.S3_ENDPOINT}/${ENV.S3_BUCKET}/${fileName}`;
    }
    return `/api/documents/files/${fileName}`;
  }

  /**
   * Resolve local disk file path
   */
  static getLocalFilePath(fileName: string): string {
    return path.join(uploadRoot, fileName);
  }
}
