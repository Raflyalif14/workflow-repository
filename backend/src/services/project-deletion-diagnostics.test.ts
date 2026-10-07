import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { supabaseAdmin } from '../config/supabase';
import { ProjectDeletionController } from '../controllers/project-deletion.controller';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { ProjectDeletionError, ProjectDeletionService } from './project-deletion.service';
import { DocumentStorageService } from '../utils/storage.util';

async function main() {
  const originalRpc = supabaseAdmin.rpc;
  const originalRemoveMany = DocumentStorageService.removeMany;
  const originalLog = console.error;
  const logs: unknown[][] = [];
  let rpcCalls = 0;
  let storageCalls = 0;
  let databaseError = { code: '23503', message: 'violates constraint "output_phase_project_fk"', details: 'PRIVATE_USER_CONTENT', hint: 'PRIVATE_STORAGE_PATH' };
  (supabaseAdmin as any).rpc = async (name: string) => {
    assert.equal(name, 'delete_project_with_cleanup');
    rpcCalls++;
    return { data: null, error: databaseError };
  };
  DocumentStorageService.removeMany = async () => { storageCalls++; };
  console.error = (...args: unknown[]) => { logs.push(args); };
  const app = express();
  app.use(express.json());
  app.delete('/projects/:projectId', (req, res) => {
    (req as AuthenticatedRequest).user = { userId: 'admin', role: 'SUPER_ADMIN' } as AuthenticatedRequest['user'];
    return ProjectDeletionController.delete(req, res);
  });
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    for (const role of ['SALES', 'SA', 'HEAD_SA']) {
      await assert.rejects(() => ProjectDeletionService.delete('project', 'PRIVATE_CONFIRMATION', { userId: 'actor', role }),
        (error: unknown) => error instanceof ProjectDeletionError && error.statusCode === 403);
    }
    assert.equal(rpcCalls, 0, 'Unauthorized callers must not reach RPC');
    const address = server.address();
    assert(address && typeof address !== 'string');
    for (const [code, status] of [['23503', 500], ['42702', 500], ['42P01', 500], ['P0002', 404], ['22023', 400]] as const) {
      databaseError = { ...databaseError, code };
      const response: Awaited<ReturnType<typeof fetch>> = await fetch(`http://127.0.0.1:${address.port}/projects/project`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'PRIVATE_CONFIRMATION' }),
      });
      assert.equal(response.status, status);
      const body = await response.text();
      assert(!body.includes('PRIVATE_') && !body.includes('output_phase_project_fk') && !body.includes(code), 'Response must keep existing safe error contract');
      assert.deepEqual(logs.at(-1), ['[ProjectDeletion] Database deletion failed.', {
        operation: 'delete_project_with_cleanup', sqlstate: code, constraint: 'output_phase_project_fk', httpStatus: status,
      }]);
    }
    databaseError = { code: 'PRIVATE_CODE', message: 'PRIVATE_MESSAGE constraint "private_token"', details: 'PRIVATE_DETAILS', hint: 'PRIVATE_HINT' };
    await assert.rejects(() => ProjectDeletionService.delete('project', 'PRIVATE_CONFIRMATION', { userId: 'admin', role: 'SUPER_ADMIN' }));
    assert.deepEqual(logs.at(-1), ['[ProjectDeletion] Database deletion failed.', {
      operation: 'delete_project_with_cleanup', sqlstate: null, constraint: null, httpStatus: 500,
    }]);
    assert(!JSON.stringify(logs).includes('PRIVATE_'), 'Logs must never contain confirmation, raw message, details, hint or paths');
    assert.equal(storageCalls, 0, 'Failed database deletion must never attempt Storage cleanup');
    console.log('Project deletion diagnostics: local HTTP statuses, RPC rejection, safe logs and no Storage calls passed.');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    supabaseAdmin.rpc = originalRpc;
    DocumentStorageService.removeMany = originalRemoveMany;
    console.error = originalLog;
  }
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
