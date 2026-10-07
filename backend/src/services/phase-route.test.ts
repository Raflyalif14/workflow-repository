import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { supabaseAdmin } from '../config/supabase';
import { authenticateJwt, requireRoles } from '../middlewares/auth.middleware';
import { ProjectManagementController } from '../controllers/project-management.controller';

async function main() {
  const from = supabaseAdmin.from, rpc = supabaseAdmin.rpc, getUser = supabaseAdmin.auth.getUser;
  let profile: any = { id: 'sales', full_name: 'Sales', email: 'sales@example.invalid', role: 'SALES', is_active: true, must_change_password: false };
  const project = { id: 'p', sales_id: 'sales', active_phase_id: 'pra', status: 'ACTIVE', is_postponed: false };
  let projectReads = 0, writes = 0;
  (supabaseAdmin.auth as any).getUser = async () => ({ data: { user: { id: profile.id } }, error: null });
  (supabaseAdmin as any).from = (table: string) => {
    assert(['users', 'projects'].includes(table));
    if (table === 'projects') projectReads++;
    const q: any = { select: () => q, eq: () => q, single: async () => ({ data: table === 'users' ? profile : project, error: null }) }; return q;
  };
  (supabaseAdmin as any).rpc = async (name: string) => {
    assert.equal(name, 'continue_project_tender_phase'); writes++;
    return { data: [{ phase_id: 'tender', created: true }], error: null };
  };
  const app = express(); app.use(express.json());
  app.post('/projects/:projectId/phases/on-submission-tender', authenticateJwt, requireRoles(['SALES']), ProjectManagementController.continuePhase);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address !== 'string');
  const request = () => fetch(`http://127.0.0.1:${address.port}/projects/p/phases/on-submission-tender`, {
    method: 'POST', headers: { authorization: 'Bearer mock-local-only', 'content-type': 'application/json' },
    body: JSON.stringify({ selected_document_keys: [] }),
  });
  try {
    for (const role of ['HEAD_SA', 'SA', 'SUPER_ADMIN']) {
      profile.role = role; assert.equal((await request()).status, 403);
    }
    assert.equal(projectReads, 0); assert.equal(writes, 0);
    profile.role = 'SALES'; profile.is_active = false;
    assert.equal((await request()).status, 401); assert.equal(projectReads, 0);
    profile.is_active = true; profile.id = 'other';
    assert.equal((await request()).status, 403); assert.equal(writes, 0);
    profile.id = 'sales'; project.is_postponed = true;
    assert.equal((await request()).status, 400); assert.equal(writes, 0);
    project.is_postponed = false; project.status = 'WON';
    assert.equal((await request()).status, 400); assert.equal(writes, 0);
    project.status = 'ACTIVE';
    assert.equal((await request()).status, 200); assert.equal(writes, 1);
    console.log('Local HTTP phase route: active Sales owner allowed; other roles, inactive account, non-owner, paused/final denied before write RPC (no live providers)');
  } finally {
    server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    (supabaseAdmin as any).from = from; (supabaseAdmin as any).rpc = rpc; (supabaseAdmin.auth as any).getUser = getUser;
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
