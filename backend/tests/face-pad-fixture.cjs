'use strict';
// Actual Node auth middleware + loopback Python PAD; provider/profile are isolated fixtures.
const path = require('node:path'), net = require('node:net'), { spawn } = require('node:child_process'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..'), pause = ms => new Promise(r => setTimeout(r, ms));
async function startPadFixture() {
  process.env.SUPABASE_URL = 'http://127.0.0.1:1'; process.env.SUPABASE_ANON_KEY = 'synthetic-only'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-only';
  process.env.TS_NODE_PROJECT = path.join(root, 'backend/tsconfig.json');
  require('../node_modules/ts-node/register/transpile-only');
  const { supabaseAdmin } = require('../src/config/supabase');
  supabaseAdmin.auth.getUser = async token => token === 'invalid' ? { data: { user: null }, error: { status: 401, code: 'bad_jwt' } } : { data: { user: { id: token } }, error: null };
  supabaseAdmin.from = table => {
    if (table !== 'users') throw Error('Unexpected fixture DB access');
    let id;
    return { select() { return this; }, eq(_key, value) { id = value; return this; }, async single() {
      return { data: { id, role: 'SA', email: 'synthetic@fixture.invalid', full_name: 'Synthetic tester', is_active: id !== 'inactive', must_change_password: id === 'password-required' }, error: null };
    } };
  };
  const probe = net.createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r)); const port = probe.address().port; await new Promise(r => probe.close(r));
  const key = crypto.randomBytes(32).toString('hex');
  process.env.FACE_PAD_ENABLED = 'true'; process.env.FACE_PAD_URL = `http://127.0.0.1:${port}`; process.env.FACE_PAD_INTERNAL_KEY = key;
  const python = spawn(path.join(root, '.cache/face-anti-spoofing-cpu/Scripts/python.exe'), ['-B', 'pad_server.py', '--port', String(port)], { cwd: path.join(root, 'services/face-anti-spoofing'), env: { ...process.env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let ready = false, failed = false, server;
  python.stdout.on('data', b => { if (b.toString().includes('PAD ready on loopback')) ready = true; });
  python.stderr.on('data', () => { failed = true; });
  async function stopPython() { if (python.exitCode === null) { python.kill(); await pause(250); } }
  async function close() { if (server) { server.closeAllConnections(); await new Promise(r => server.close(r)); } await stopPython(); }
  try {
    for (let i = 0; i < 100 && !ready; i++) { if (failed || python.exitCode !== null) throw Error('Owned PAD startup failed'); await pause(100); }
    if (!ready) throw Error('Owned PAD startup deadline exceeded');
    const express = require('../node_modules/express'), cors = require('../node_modules/cors');
    const { createFacePadRouter } = require('../src/routes/face-pad.routes');
    const app = express(); app.use(cors()); app.use('/api/face-pad', createFacePadRouter());
    server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
    return { origin: 'http://127.0.0.1:' + server.address().port, pythonOrigin: process.env.FACE_PAD_URL, key, close, stopPython };
  } catch (e) { await close(); throw e; }
}
module.exports = { startPadFixture };
