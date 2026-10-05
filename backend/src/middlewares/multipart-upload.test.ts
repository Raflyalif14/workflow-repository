import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import express, { RequestHandler } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { DocumentStorageService, MAX_DOCUMENT_FILE_SIZE_BYTES, uploadMiddleware } from '../utils/storage.util';
import { OutputDocumentController } from '../controllers/output-document.controller';
import { OutputDocumentService } from '../services/output-document.service';
import { DocumentController } from '../controllers/document.controller';
import { ProjectManagementController } from '../controllers/project-management.controller';
import { SalesMilestoneDocumentController } from '../controllers/sales-milestone-document.controller';
import { MilestoneContributionController } from '../controllers/milestone-contribution.controller';
import { errorHandler } from './error.middleware';
import { handleMultipartUpload } from './multipart-upload.middleware';

const boundary = 'workflow-test-boundary';
const requestId = '10000000-0000-4000-8000-000000000001';
const lanes = [
  { path: '/api/projects/p/output-documents/proposal_teknis/upload', role: 'SA', field: 'file', limit: 1, error: 500 },
  { path: '/api/documents/d/versions', role: 'SALES', field: 'file', limit: 1, error: 500 },
  { path: '/api/projects', role: 'SALES', field: 'mom', limit: 1, error: 400 },
  { path: '/api/milestones/m/documents', role: 'SALES', field: 'files', limit: 10, error: 400 },
  { path: '/api/milestones/m/contributions', role: 'SALES', field: 'files', limit: 10, error: 400 },
];
const text = (name: string, value: string) => Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
const header = (name: string, filename = 'sample.pdf') => Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n`);
const part = (name: string, filename = 'sample.pdf') => Buffer.concat([header(name, filename), Buffer.from('abc\r\n')]);
const end = Buffer.from(`--${boundary}--\r\n`);
const metadata = [text('expected_draft_revision', '0'), text('request_id', requestId), text('replace_file_id', requestId)];
type Reply = { status: number; body: any };

async function post(server: Server, path: string, role: string | undefined, chunks: Buffer[], contentType = `multipart/form-data; boundary=${boundary}`): Promise<Reply> {
  const port = (server.address() as AddressInfo).port;
  let sender: ReturnType<typeof request>;
  const result = new Promise<Reply>((resolve, reject) => {
    sender = request({ hostname: '127.0.0.1', port, path, method: 'POST', headers: {
      'Content-Type': contentType, 'Content-Length': chunks.reduce((size, chunk) => size + chunk.length, 0),
      ...(role ? { Authorization: `Bearer ${role}` } : {}),
    } }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('error', reject);
      response.on('end', () => {
        try { resolve({ status: response.statusCode!, body: JSON.parse(body) }); }
        catch (error) { reject(error); }
      });
    });
    sender.setTimeout(8000, () => sender.destroy(new Error('Upload HTTP test timed out')));
    sender.on('error', reject);
    sender.end(Buffer.concat(chunks));
  });
  return result;
}

async function main() {
  const original = { auth: supabaseAdmin.auth.getUser, from: supabaseAdmin.from, rpc: supabaseAdmin.rpc,
    storage: DocumentStorageService.upload, outputService: OutputDocumentService.upload,
    output: OutputDocumentController.upload, document: DocumentController.uploadNewVersion,
    project: ProjectManagementController.create, sales: SalesMilestoneDocumentController.upload,
    contribution: MilestoneContributionController.create, nodeEnv: process.env.NODE_ENV };
  const counts = { controller: 0, storage: 0, metadata: 0, parser: 0 };
  const received: any[] = [];
  const unexpected: unknown[] = [];
  const engine = (uploadMiddleware as unknown as { storage: import('multer').StorageEngine }).storage;
  const originalHandle = engine._handleFile;
  let startAbort: (() => void) | undefined;
  const onUnexpected = (error: unknown) => { unexpected.push(error); };
  let server: Server | undefined;
  try {
    process.env.NODE_ENV = 'development'; // Responses must not leak stack even here.
    process.on('unhandledRejection', onUnexpected);
    process.on('uncaughtExceptionMonitor', onUnexpected);
    engine._handleFile = (req, file, callback) => {
      counts.parser++;
      if (req.headers['x-test-abort']) startAbort?.();
      originalHandle.call(engine, req, file, callback);
    };
    (supabaseAdmin.auth as any).getUser = async (role: string) => ({ data: { user: { id: role } }, error: null });
    (supabaseAdmin as any).from = (table: string) => {
      assert.equal(table, 'users', 'Only the mocked auth profile may be read');
      let role = '';
      const query = { select: () => query, eq: (_column: string, value: string) => { role = value; return query; },
        single: async () => ({ data: { id: role, role: role === 'INACTIVE' ? 'SA' : role,
          full_name: 'Test actor', email: 'test@example.invalid', is_active: role !== 'INACTIVE', must_change_password: false }, error: null }) };
      return query;
    };
    (supabaseAdmin as any).rpc = async () => { counts.metadata++; return { data: null, error: null }; };
    (DocumentStorageService as any).upload = async () => { counts.storage++; };
    const persisted = async (req: any, res: any) => {
      counts.controller++;
      received.push({ body: req.body, file: req.file, files: req.files });
      await DocumentStorageService.upload(req.file || (Array.isArray(req.files) ? req.files[0] : req.files?.mom?.[0]), 'mock-only');
      await supabaseAdmin.rpc('mock_only_no_live_write');
      res.status(201).json({ success: true });
    };
    (OutputDocumentController as any).upload = (req: any, res: any) => { counts.controller++; return original.output(req, res); };
    (OutputDocumentService as any).upload = async (_project: string, _key: string, file: Express.Multer.File, _actor: unknown, input: unknown) => {
      received.push({ body: input, file });
      await DocumentStorageService.upload(file, 'mock-only');
      await supabaseAdmin.rpc('mock_only_no_live_write');
      return { documentKey: 'proposal_teknis', draftRevision: 1, fileId: requestId, status: 'DRAFT' };
    };
    (DocumentController as any).uploadNewVersion = persisted;
    (ProjectManagementController as any).create = persisted;
    (SalesMilestoneDocumentController as any).upload = persisted;
    (MilestoneContributionController as any).create = persisted;
    // Import after stubbing handlers: real routers, role guards and Multer config.
    const app = express();
    let aborted: (() => void) | undefined;
    app.use((req, _res, next) => { if (req.headers['x-test-abort']) req.once('aborted', () => aborted?.()); next(); });
    app.use('/api/projects', require('../routes/project.routes').default);
    app.use('/api/documents', require('../routes/document.routes').default);
    app.use('/api/milestones', require('../routes/milestone.routes').default);
    app.post('/sync-parser-error', handleMultipartUpload((() => { throw new Error('private parser details'); }) as RequestHandler, 'Invalid upload.'));
    app.use(errorHandler);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const healthy = async () => {
      const lane = lanes[0];
      const result = await post(server!, lane.path, lane.role, [...metadata, part(lane.field), end]);
      assert.equal(result.status, 200);
      const latest = received[received.length - 1];
      assert.equal(latest.body.request_id, requestId);
      assert.equal(latest.body.expected_draft_revision, 0);
      assert.equal(latest.body.replace_file_id, requestId);
      assert.equal(latest.file.buffer.toString(), 'abc');
    };
    for (const lane of lanes) {
      const valid = lane === lanes[0] ? [...metadata, part('file'), end] : lane === lanes[2]
        ? [text('selectedDocumentKeys', '["proposal_teknis"]'), part('mom'), part('photos', 'photo.png'), part('documents'), end]
        : lane === lanes[4] ? [text('note', 'Test'), part(lane.field), end] : [part(lane.field), end];
      assert.equal((await post(server, lane.path, lane.role, valid)).status, lane === lanes[0] ? 200 : 201);
      const reject = async (chunks: Buffer[], contentType?: string) => {
        const before = { ...counts };
        const response = await post(server!, lane.path, lane.role, chunks, contentType);
        assert.equal(response.status, lane.error);
        assert.equal(response.body.success, false);
        assert.equal(response.body.errors, null);
        assert(!JSON.stringify(response.body).match(/MulterError|Busboy|node_modules|Unexpected end|wrong_field|sample\.pdf/));
        assert.equal(counts.controller, before.controller);
        assert.equal(counts.storage, before.storage);
        assert.equal(counts.metadata, before.metadata);
        await healthy(); // Server accepts the next request after every rejection.
      };
      await reject([part('wrong_field'), end]);
      await reject([...Array.from({ length: lane.limit + 1 }, () => part(lane.field)), end]);
      await reject([part(lane.field, 'unsupported.exe'), end]);
      await reject([header(lane.field), Buffer.from('unterminated')]);
      await reject([Buffer.from('broken')], 'multipart/form-data');
      await reject([text('items[4294967294]', 'x'), end]);
      await reject([text(`field${'[a]'.repeat(9)}`, 'x'), end]);
      if (lane !== lanes[1]) {
        const before = { ...counts };
        assert.equal((await post(server, lane.path, 'WRONG_ROLE', [part(lane.field), end])).status, 403);
        assert.equal(counts.parser, before.parser, 'Role rejection occurs before memory parsing');
        assert.equal(counts.controller, before.controller);
      }
    }
    for (const identity of [undefined, 'INACTIVE']) {
      const before = { ...counts };
      assert.equal((await post(server, lanes[0].path, identity, [...metadata, part('file'), end])).status, 401);
      assert.deepEqual(counts, before, 'Authentication/account rejection precedes parsing and persistence');
    }
    const block = Buffer.alloc(256 * 1024);
    const large = Array.from({ length: MAX_DOCUMENT_FILE_SIZE_BYTES / block.length }, () => block);
    const beforeLarge = { ...counts };
    const oversized = await post(server, lanes[0].path, 'SA', [...metadata, header('file'), ...large, Buffer.from('x\r\n'), end]);
    assert.equal(oversized.status, 500);
    assert.equal(counts.controller, beforeLarge.controller);
    assert.equal(counts.storage, beforeLarge.storage);
    assert.equal(counts.metadata, beforeLarge.metadata);
    await healthy();
    assert.equal((await post(server, lanes[0].path, 'SA', [...metadata, header('file'), ...large, Buffer.from('\r\n'), end])).status, 200,
      'Exactly 50 MiB remains accepted');
    const beforeAbort = { ...counts };
    let abortTimer: NodeJS.Timeout | undefined;
    await new Promise<void>((resolve, reject) => {
      aborted = resolve;
      const sender = request({ hostname: '127.0.0.1', port: (server!.address() as AddressInfo).port,
        path: lanes[0].path, method: 'POST', headers: { Authorization: 'Bearer SA', 'x-test-abort': '1',
          'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': 1000000 } });
      sender.on('error', () => undefined); // Intentional client disconnect.
      startAbort = () => sender.destroy(); // Barrier: parser has begun the file.
      abortTimer = setTimeout(() => { sender.destroy(); reject(new Error('Abort was not observed by server')); }, 8000);
      sender.write(Buffer.concat([...metadata, header('file'), Buffer.alloc(8192)]));
    });
    clearTimeout(abortTimer);
    await healthy();
    assert.equal(counts.controller, beforeAbort.controller + 1, 'Only the subsequent healthy request runs its controller');
    assert.equal(counts.storage, beforeAbort.storage + 1);
    assert.equal(counts.metadata, beforeAbort.metadata + 1);
    assert.equal((await post(server, '/sync-parser-error', undefined, [])).body.errors, null);
    await healthy();
    assert.deepEqual(unexpected, [], 'No uncaught exception or unhandled rejection');
    console.log('Multipart HTTP: 5 active routes, valid/50 MiB, oversized, wrong/excess files, malformed, field limits, abort and auth ordering passed');
  } finally {
    if (server) { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve())); }
    supabaseAdmin.auth.getUser = original.auth; supabaseAdmin.from = original.from; supabaseAdmin.rpc = original.rpc;
    DocumentStorageService.upload = original.storage; OutputDocumentService.upload = original.outputService;
    OutputDocumentController.upload = original.output; DocumentController.uploadNewVersion = original.document;
    ProjectManagementController.create = original.project; SalesMilestoneDocumentController.upload = original.sales;
    MilestoneContributionController.create = original.contribution; engine._handleFile = originalHandle;
    process.removeListener('unhandledRejection', onUnexpected); process.removeListener('uncaughtExceptionMonitor', onUnexpected);
    if (original.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = original.nodeEnv;
  }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
