import { readFileSync } from 'fs';
import { join } from 'path';
import { canAccessDocumentProject, DocumentServiceError } from './document.service';
import { buildDocumentStoragePath, sanitizeStorageFileName } from '../utils/storage.util';

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

const project = { sales_id: 'sales-owner', pic_id: 'sa-owner' };
assert(canAccessDocumentProject(project, { userId: 'sales-owner', role: 'SALES', fullName: 'Sales Owner' }), 'Test 1: project owner should access documents');
assert(!canAccessDocumentProject(project, { userId: 'sales-other', role: 'SALES', fullName: 'Other Sales' }), 'Test 1: other Sales user should not access documents');
assert(canAccessDocumentProject(project, { userId: 'sa-owner', role: 'SA', fullName: 'SA Owner' }), 'Test 1: assigned SA should access documents');
assert(canAccessDocumentProject(project, { userId: 'head-sa', role: 'HEAD_SA', fullName: 'Head SA' }), 'Test 1: Head SA should access documents');
console.log('Test 1 - Document project access is role-aware: passed');

const safeName = sanitizeStorageFileName('Architecture Diagram (final).pdf');
const storagePath = buildDocumentStoragePath('project-1', 'document-1', 'Architecture Diagram (final).pdf');
assert(safeName === 'Architecture_Diagram__final_.pdf', 'Test 2: storage filename should be sanitized');
assert(storagePath.startsWith('project-1/document-1/'), 'Test 2: storage path should stay scoped to the project and document');
assert(storagePath.endsWith('-Architecture_Diagram__final_.pdf'), 'Test 2: storage path should retain only the sanitized filename');
console.log('Test 2 - Document storage path is private and deterministic in scope: passed');

const forbidden = new DocumentServiceError('Forbidden', 403);
assert(forbidden.statusCode === 403, 'Test 3: document authorization errors should preserve HTTP status');
console.log('Test 3 - Document authorization errors preserve status: passed');

const serviceSource = readFileSync(join(__dirname, 'document.service.ts'), 'utf8');
const routeSource = readFileSync(join(__dirname, '..', 'routes', 'document.routes.ts'), 'utf8');
const oldOrm = ['pri', 'sma'].join('');
assert(!serviceSource.includes(oldOrm), 'Test 4: document service must not use the removed ORM runtime');
assert(!serviceSource.includes('Workflow' + 'Engine'), 'Test 4: document review must not mutate milestone workflow');
assert(serviceSource.includes("createSignedDownloadUrl") && routeSource.includes("/versions/:versionId/download-url"), 'Test 4: downloads must use authenticated signed URLs');
console.log('Test 4 - Document runtime uses Supabase Storage signed URLs only: passed');
