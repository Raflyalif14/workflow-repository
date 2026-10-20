'use strict';
// Isolated Node + real Python, actual Node authentication middleware with synthetic provider/profile.
const path = require('node:path'), net = require('node:net'), { spawn } = require('node:child_process'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
async function port() { const server = net.createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r)); const n = server.address().port; await new Promise(r => server.close(r)); return n; }
const pause = ms => new Promise(r => setTimeout(r, ms));
async function startFixture() {
  process.env.SUPABASE_URL = 'http://127.0.0.1:1'; process.env.SUPABASE_ANON_KEY = 'fixture-not-a-real-key'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-not-a-real-key';
  process.env.TS_NODE_PROJECT = path.join(root, 'backend/tsconfig.json');
  require('../node_modules/ts-node/register/transpile-only');
  const { supabaseAdmin } = require('../src/config/supabase');
  const { authenticateUser } = require('../src/middlewares/auth.middleware');
  const { createFaceExperimentRouter } = require('../src/routes/face-experiment.routes');
  supabaseAdmin.auth.getUser = async token => {
    if (token === 'invalid') return { data: { user: null }, error: { status: 401, code: 'bad_jwt' } };
    return { data: { user: { id: token } }, error: null };
  };
  supabaseAdmin.from = table => {
    if (table !== 'users') throw Error('Unexpected database access in face fixture');
    let actor;
    return { select() { return this; }, eq(_key, value) { actor = value; return this; }, async single() {
      return { data: { id: actor, role: 'SA', email: 'fixture@invalid.test', full_name: 'Synthetic face tester', is_active: actor !== 'inactive', must_change_password: actor === 'password-required' }, error: null };
    } };
  };
  const pythonPort = await port(), key = crypto.randomBytes(32).toString('hex');
  process.env.FACE_EXPERIMENT_ENABLED = 'true'; process.env.FACE_EXPERIMENT_URL = 'http://127.0.0.1:' + pythonPort; process.env.FACE_EXPERIMENT_INTERNAL_KEY = key;
  const python = spawn(path.join(root, 'services/face-experiment/.venv/Scripts/python.exe'), ['server.py', '--port', String(pythonPort)], {
    cwd: path.join(root, 'services/face-experiment'), env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let safeLog = '', failed = false;
  python.stdout.on('data', b => { if (b.toString().includes('ready on loopback')) safeLog = 'ready'; }); python.stderr.on('data', () => { failed = true; });
  let server;
  async function close() {
    if (server) { server.closeAllConnections(); await new Promise(r => server.close(r)); }
    if (python.exitCode === null) { python.kill(); await pause(250); }
  }
  try {
    for (let i = 0; i < 100 && safeLog !== 'ready'; i++) { if (python.exitCode !== null || failed) throw Error('Isolated Python startup failed'); await pause(100); }
    if (safeLog !== 'ready') throw Error('Isolated Python startup deadline exceeded');
    const express = require('../node_modules/express'), cors = require('../node_modules/cors');
    const traffic = [];
    const app = express(); app.use(cors());
    app.use((req, res, next) => { res.once('finish', () => traffic.push({ path: req.path, method: req.method, authenticatedHeader: Boolean(req.headers.authorization), status: res.statusCode })); next(); });
    app.use('/api/face-experiment', createFaceExperimentRouter(authenticateUser));
    server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
    return { origin: 'http://127.0.0.1:' + server.address().port, pythonOrigin: 'http://127.0.0.1:' + pythonPort, key, close, traffic,
      stopPython: async () => { python.kill(); await pause(250); } };
  } catch (error) { await close(); throw error; }
}
module.exports = { startFixture };
