import assert from 'node:assert/strict';
import { AddressInfo } from 'net';
import { request as httpRequest } from 'http';
import express from 'express';
import { supabaseAdmin } from '../config/supabase';
import authRoutes from '../routes/auth.routes';

const row = {
  id: 'user-1', email: 'owner@example.test', full_name: 'Project Owner', role: 'HEAD_SA',
  is_active: true, must_change_password: false, created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-02-01T00:00:00Z', preferred_language: 'id',
  private_note: 'must never be returned',
};

async function run() {
  const originalGetUser = supabaseAdmin.auth.getUser;
  const originalFrom = supabaseAdmin.from;
  let profileReads = 0;
  let selectedColumns = '';
  let currentRow: Omit<typeof row, 'preferred_language'> & { preferred_language: string | null } = { ...row };
  (supabaseAdmin.auth as any).getUser = async () => ({ data: { user: { id: row.id } }, error: null });
  (supabaseAdmin as any).from = (table: string) => {
    assert.equal(table, 'users');
    const query = {
      select: (columns: string) => { selectedColumns = columns; return query; },
      eq: (column: string, value: string) => { assert.equal(column, 'id'); assert.equal(value, row.id); return query; },
      single: async () => { profileReads++; return { data: currentRow, error: null }; },
    };
    return query;
  };

  const app = express();
  app.use('/api/auth', authRoutes);
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const port = (server.address() as AddressInfo).port;
    const getMe = () => new Promise<{ status: number; body: any }>((resolve, reject) => {
      const request = httpRequest({ hostname: '127.0.0.1', port, path: '/api/auth/me', headers: { Authorization: 'Bearer test-token' } }, (response) => {
        let body = '';
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => resolve({ status: response.statusCode || 0, body: JSON.parse(body) }));
      });
      request.once('error', reject);
      request.end();
    });

    const active = await getMe();
    assert.equal(active.status, 200);
    assert.deepEqual(active.body, {
      success: true, message: 'Profile retrieved successfully', data: {
        id: row.id, email: row.email, full_name: row.full_name, fullName: row.full_name,
        role: row.role, is_active: true, isActive: true, must_change_password: false,
        mustChangePassword: false, createdAt: row.created_at, updatedAt: row.updated_at,
        preferredLanguage: 'id',
      },
    });
    assert.equal(profileReads, 1, '/me reads users only once, in authentication middleware');
    for (const column of ['id', 'email', 'full_name', 'role', 'is_active', 'must_change_password', 'created_at', 'updated_at', 'preferred_language']) {
      assert(selectedColumns.split(',').map((value) => value.trim()).includes(column), `Missing response field ${column}`);
    }
    assert(!JSON.stringify(active.body).includes('private_note'));

    currentRow = { ...row, must_change_password: true, preferred_language: null };
    const passwordChange = await getMe();
    assert.equal(passwordChange.status, 200, '/me remains available for initial password change');
    assert.equal(passwordChange.body.data.mustChangePassword, true);
    assert.equal(passwordChange.body.data.preferredLanguage, 'en');

    currentRow = { ...row, is_active: false };
    const inactive = await getMe();
    assert.equal(inactive.status, 401, 'Inactive users are rejected before the controller');
    assert.equal(inactive.body.success, false);
    assert.equal(profileReads, 3, 'Each request performs only its middleware profile query');
    console.log('Auth /me response contract, inactive rejection, and single users read: passed');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    (supabaseAdmin.auth as any).getUser = originalGetUser;
    supabaseAdmin.from = originalFrom;
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
