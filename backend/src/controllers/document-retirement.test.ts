import { Response } from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';
import { supabaseAdmin } from '../config/supabase';
import { DocumentController } from './document.controller';

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

type CapturedResponse = {
  statusCode?: number;
  body?: unknown;
  status: (statusCode: number) => CapturedResponse;
  json: (body: unknown) => CapturedResponse;
};

const response: CapturedResponse = {
  status(statusCode) {
    this.statusCode = statusCode;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
};

const originalFrom = supabaseAdmin.from;
let databaseTouched = false;
const routeSource = readFileSync(join(__dirname, '../routes/document.routes.ts'), 'utf8');

assert(
  routeSource.includes("router.post('/', DocumentController.retiredCreateDocument);"),
  'Test 1: POST /documents must use the retired creation handler'
);
assert(!routeSource.includes('DocumentController.createDocument'), 'Test 1: POST /documents must not invoke document creation');
assert(
  routeSource.includes("router.get('/', DocumentController.listDocuments);") &&
    routeSource.includes("router.get('/versions/:versionId/download-url', DocumentController.getDownloadUrl);") &&
    routeSource.includes("router.get('/:id', DocumentController.getDocument);"),
  'Test 1: document list, read, and signed download routes must remain available'
);

try {
  (supabaseAdmin as any).from = () => {
    databaseTouched = true;
    throw new Error('The retired endpoint must not access the database.');
  };

  DocumentController.retiredCreateDocument({} as any, response as Response);

  assert(response.statusCode === 410, 'Test 1: generic document creation must return HTTP 410');
  assert(
    (response.body as { success?: boolean }).success === false,
    'Test 1: retired endpoint must return the standard error response envelope'
  );
  assert(
    (response.body as { message?: string }).message === 'Direct repository document uploads have been retired. Use the relevant project workflow to add documents.',
    'Test 1: retired endpoint must return a safe generic message'
  );
  assert(!databaseTouched, 'Test 1: retired endpoint must not create document, version, or approval rows');
  console.log('Test 1 - Generic document creation is retired without database writes: passed');
} finally {
  (supabaseAdmin as any).from = originalFrom;
}
