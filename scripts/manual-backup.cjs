'use strict';
// Read-only source backup. Never restores or modifies Supabase data.
const fs = require('node:fs'), fsp = fs.promises, path = require('node:path');
const crypto = require('node:crypto'), { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { spawn, execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function databaseEnvironment(databaseUrl, inherited = process.env) {
  const parsed = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || !parsed.username || !parsed.password || parsed.hash) throw Error('Invalid database connection format');
  return {
    ...inherited,
    // PGDATABASE alone is not a reliable way to pass a URI to every libpq tool.
    // Individual environment variables also keep credentials out of argv.
    PGHOST: parsed.hostname, PGPORT: parsed.port || '5432',
    PGUSER: decodeURIComponent(parsed.username), PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: decodeURIComponent(parsed.pathname.slice(1)) || 'postgres',
    PGCONNECT_TIMEOUT: '20', PGSSLMODE: ['require', 'verify-ca', 'verify-full'].includes(parsed.searchParams.get('sslmode')) ? parsed.searchParams.get('sslmode') : 'require', PGAPPNAME: 'workflow-manual-backup',
  };
}
function inside(base, relative) {
  const target = path.resolve(base, relative);
  if (!relative || path.isAbsolute(relative) || target === base || !target.startsWith(base + path.sep)) throw Error('Unsafe backup path');
  return target;
}
async function encrypt(source, destination, key) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const digest = crypto.createHash('sha256'); let bytes = 0;
  const measure = new Transform({ transform(chunk, encoding, callback) { bytes += chunk.length; digest.update(chunk); callback(null, chunk); } });
  await pipeline(source, measure, cipher, fs.createWriteStream(destination, { flags: 'wx', mode: 0o600 }));
  return { iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), sha256: digest.digest('hex'), bytes };
}
async function verifyEntry(base, entry, key) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(entry.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(entry.tag, 'hex'));
  const digest = crypto.createHash('sha256'); let bytes = 0;
  const chunks = [];
  const sink = new Transform({ transform(chunk, encoding, callback) { bytes += chunk.length; digest.update(chunk); if (entry.kind === 'catalog') chunks.push(chunk); callback(); } });
  await pipeline(fs.createReadStream(inside(base, entry.file)), decipher, sink);
  if (bytes !== entry.bytes || digest.digest('hex') !== entry.sha256) throw Error('Backup checksum mismatch');
  return entry.kind === 'catalog' ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null;
}
async function verify(base, keyPath) {
  if (fs.existsSync(path.join(base, 'FAILED.txt'))) throw Error('Incomplete backup cannot be verified as a recovery point');
  const key = await fsp.readFile(keyPath);
  try {
    const manifest = JSON.parse(await fsp.readFile(path.join(base, 'manifest.json'), 'utf8'));
    if (manifest.version !== 1 || key.length !== 32) throw Error('Invalid backup format/key');
    const catalog = await verifyEntry(base, manifest.catalog, key);
    if (catalog.entries.length !== manifest.payloadCount) throw Error('Backup entry count mismatch');
    const seen = new Set();
    for (const item of catalog.entries) {
      if (seen.has(item.file)) throw Error('Duplicate backup entry'); seen.add(item.file);
      await verifyEntry(base, item, key);
    }
    return { payloads: seen.size, status: catalog.status, components: catalog.components };
  } finally { key.fill(0); }
}
function run(command, args, options = {}) {
  const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], ...options });
  let stderr = '';
  child.stderr.on('data', chunk => { if (stderr.length < 65536) stderr += chunk.toString('utf8'); });
  const completed = new Promise((resolve, reject) => {
    child.on('error', () => reject(Error('Backup subprocess unavailable')));
    child.on('close', code => {
      if (code === 0) { resolve(); return; }
      const error = Error('Backup subprocess failed');
      error.publicCode = /password authentication failed|SASL authentication failed/i.test(stderr) ? 'DATABASE_AUTHENTICATION_FAILED'
        : /permission denied/i.test(stderr) ? 'DATABASE_PERMISSION_DENIED'
        : /version mismatch/i.test(stderr) ? 'DATABASE_VERSION_MISMATCH' : 'BACKUP_SUBPROCESS_FAILED';
      reject(error);
    });
  });
  // Attach immediately: encryption and child failure may finish independently.
  completed.catch(() => {});
  return { child, completed };
}
async function main() {
  if (process.argv[2] === 'verify') {
    const result = await verify(path.resolve(process.argv[3]), path.resolve(process.argv[4]));
    console.log(JSON.stringify(result, null, 2)); return;
  }
  const privateDir = path.join(ROOT, '.private');
  if ((await fsp.lstat(privateDir)).isSymbolicLink()) throw Error('Private directory cannot be a symlink');
  const env = require('../backend/node_modules/dotenv').parse(await fsp.readFile(path.join(ROOT, 'backend/.env')));
  const id = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.join(privateDir, 'backups', 'backup-' + id), keyDir = path.join(privateDir, 'backup-keys');
  await fsp.mkdir(base, { recursive: true, mode: 0o700 }); await fsp.mkdir(keyDir, { recursive: true, mode: 0o700 });
  const keyPath = path.join(keyDir, id + '.key'), key = crypto.randomBytes(32);
  await fsp.writeFile(keyPath, key, { flag: 'wx', mode: 0o600 });
  const entries = [], components = {}, startedAt = new Date().toISOString();
  async function add(source, kind, originalPath) {
    const file = String(entries.length + 1).padStart(6, '0') + '.enc';
    const metadata = await encrypt(source, path.join(base, file), key);
    entries.push({ file, kind, originalPath, ...metadata });
    return metadata;
  }
  async function local(relative, kind) {
    const full = inside(ROOT, relative), before = await fsp.lstat(full);
    if (!before.isFile() || before.isSymbolicLink()) throw Error('Unsafe local source');
    const data = await fsp.readFile(full);
    try {
      const result = await add(Readable.from([data]), kind, relative.replaceAll('\\', '/'));
      const after = await fsp.readFile(full);
      try { if (hash(after) !== result.sha256) throw Error('Local source changed during backup'); } finally { after.fill(0); }
    } finally { data.fill(0); }
  }
  try {
    const git = run('git', ['archive', '--format=zip', 'HEAD'], { cwd: ROOT });
    await Promise.all([add(git.child.stdout, 'code', 'code-checkpoint.zip'), git.completed]);
    components.code = 'committed HEAD only';
    for (const relative of ['backend/.env', 'frontend/.env']) if (fs.existsSync(path.join(ROOT, relative))) await local(relative, 'configuration');
    const faceDir = path.join(privateDir, 'face-login');
    const faceBefore = fs.existsSync(faceDir) ? (await fsp.readdir(faceDir)).filter(n => /^[0-9a-f-]{36}\.json$/i.test(n)).sort() : [];
    if (faceBefore.length) {
      if (fs.existsSync(path.join(privateDir, 'face-login-key.bin'))) await local('.private/face-login-key.bin', 'face-key');
      else if (!env.FACE_LOGIN_ENCRYPTION_KEY) throw Error('Face encryption key unavailable');
      for (const name of faceBefore) await local(path.join('.private/face-login', name), 'face-credential');
      const faceAfter = (await fsp.readdir(faceDir)).filter(n => /^[0-9a-f-]{36}\.json$/i.test(n)).sort();
      if (JSON.stringify(faceBefore) !== JSON.stringify(faceAfter)) throw Error('Face registrations changed during backup');
    }
    components.face = { credentials: faceBefore.length, browserKeyIncluded: false };
    const client = require('../backend/node_modules/@supabase/supabase-js').createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(120000) }) },
    });
    const { data: buckets, error: bucketError } = await client.storage.listBuckets();
    if (bucketError || !buckets) throw Error('Cannot list Storage buckets');
    await add(Readable.from([Buffer.from(JSON.stringify(buckets))]), 'storage-metadata', 'buckets.json');
    async function list(bucket, prefix = '') {
      const output = [];
      for (let offset = 0;; offset += 100) {
        const { data, error } = await client.storage.from(bucket).list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
        if (error || !data) throw Error('Cannot list Storage objects');
        for (const item of data) {
          const objectPath = prefix ? prefix + '/' + item.name : item.name;
          if (item.id == null) output.push(...await list(bucket, objectPath));
          else output.push({ path: objectPath, id: item.id, updated_at: item.updated_at, metadata: item.metadata });
        }
        if (data.length < 100) break;
      }
      return output.sort((a, b) => a.path.localeCompare(b.path));
    }
    let objectCount = 0;
    for (const bucket of buckets) {
      const before = await list(bucket.id);
      for (const object of before) {
        const { data, error } = await client.storage.from(bucket.id).download(object.path);
        if (error || !data) throw Error('Cannot download Storage object');
        const result = await add(Readable.fromWeb(data.stream()), 'storage-object', { bucket: bucket.id, path: object.path, metadata: object });
        if (Number.isFinite(object.metadata?.size) && result.bytes !== object.metadata.size) throw Error('Storage object size mismatch');
        objectCount++;
      }
      if (JSON.stringify(before) !== JSON.stringify(await list(bucket.id))) throw Error('Storage changed during backup; retry in a quiet window');
    }
    if (JSON.stringify(buckets.map(b => b.id).sort()) !== JSON.stringify((await client.storage.listBuckets()).data?.map(b => b.id).sort())) throw Error('Storage bucket list changed');
    components.storage = { buckets: buckets.length, objects: objectCount, repeatListingMatched: true };
    const databaseUrl = process.env.BACKUP_DATABASE_URL || env.BACKUP_DATABASE_URL;
    if (databaseUrl) {
      const pgDump = process.env.PG_DUMP_PATH || 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe';
      const pgEnv = databaseEnvironment(databaseUrl);
      // This laptop's PG18 install lacks zlib1.dll in bin. The existing PG16
      // runtime supplies that dependency without changing either installation.
      if (process.platform === 'win32') pgEnv.PATH = (pgEnv.PATH || pgEnv.Path || '') + ';C:\\Program Files\\PostgreSQL\\16\\bin';
      const pg = run(pgDump, ['--format=custom', '--no-owner', '--no-acl', '--no-password'], { env: pgEnv });
      await Promise.all([add(pg.child.stdout, 'postgresql', 'database.dump'), pg.completed]);
      components.database = 'pg_dump completed; restore not tested';
    } else components.database = 'BLOCKED: BACKUP_DATABASE_URL not configured; no database data or Auth accounts exported';
    const catalog = { version: 1, startedAt, finishedAt: new Date().toISOString(), gitCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(), status: databaseUrl ? 'CAPTURED_NOT_RESTORE_TESTED' : 'PARTIAL_NO_DATABASE', components, entries };
    const catalogMetadata = await encrypt(Readable.from([Buffer.from(JSON.stringify(catalog))]), path.join(base, 'catalog.enc'), key);
    await fsp.writeFile(path.join(base, 'manifest.json'), JSON.stringify({ version: 1, payloadCount: entries.length, catalog: { file: 'catalog.enc', kind: 'catalog', ...catalogMetadata } }, null, 2), { flag: 'wx', mode: 0o600 });
    await fsp.writeFile(path.join(base, 'STATUS.txt'), `${catalog.status}\nEncrypted manual backup. Keep the matching key separately.\nBrowser non-exportable device keys are not included. A new browser may need password login and face re-enrollment.\nDatabase and Storage were not captured in a single atomic snapshot. Perform a separate restore drill before relying on this backup.\n`, { flag: 'wx', mode: 0o600 });
    const checked = await verify(base, keyPath);
    console.log(JSON.stringify({ backupDirectory: base, separateKeyFile: keyPath, ...checked }, null, 2));
  } catch (error) {
    await fsp.writeFile(path.join(base, 'FAILED.txt'), 'Backup incomplete. Do not use as a recovery point. Retry after resolving the reported component.\n' + (error.publicCode || 'BACKUP_FAILED') + '\n');
    throw error;
  } finally { key.fill(0); }
}
module.exports = { encrypt, verify, verifyEntry, inside, databaseEnvironment };
if (require.main === module) main().catch(error => { console.error('Backup failed:', error.publicCode || 'BACKUP_FAILED', '- no source data changed; no secrets printed.'); process.exitCode = 1; });
