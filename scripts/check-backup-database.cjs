'use strict';
// Decrypts only into process pipes. Does not connect to any database or write SQL.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { spawn } = require('node:child_process'), { pipeline } = require('node:stream/promises');
const { verify, verifyEntry, inside } = require('./manual-backup.cjs');
async function main() {
  const base = path.resolve(process.argv[2]), keyPath = path.resolve(process.argv[3]);
  const verified = await verify(base, keyPath), key = fs.readFileSync(keyPath);
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(base, 'manifest.json'), 'utf8'));
    const catalog = await verifyEntry(base, manifest.catalog, key);
    const databases = catalog.entries.filter(entry => entry.kind === 'postgresql');
    if (databases.length !== 1) throw Error('Expected one database archive');
    const entry = databases[0];
    const executable = process.env.PG_RESTORE_PATH || 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_restore.exe';
    const env = { ...process.env };
    if (process.platform === 'win32') env.PATH = (env.PATH || env.Path || '') + ';C:\\Program Files\\PostgreSQL\\16\\bin';
    async function inspect(args, collect) {
      const child = spawn(executable, args, { windowsHide: true, env, stdio: ['pipe', collect ? 'pipe' : 'ignore', 'pipe'] });
      let output = ''; if (collect) child.stdout.on('data', chunk => { output += chunk; });
      child.stderr.resume();
      const complete = new Promise((resolve, reject) => {
        child.once('error', () => reject(Error('Archive reader unavailable')));
        child.once('close', code => code === 0 ? resolve() : reject(Error('Archive reader failed')));
      });
      complete.catch(() => {});
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(entry.iv, 'hex'));
      decipher.setAuthTag(Buffer.from(entry.tag, 'hex'));
      // --list may exit after its TOC; --file=- below consumes the entire dump.
      const streamed = pipeline(fs.createReadStream(inside(base, entry.file)), decipher, child.stdin);
      await Promise.all([streamed.catch(error => { if (!collect || !['EPIPE', 'ERR_STREAM_PREMATURE_CLOSE'].includes(error.code)) throw error; }), complete]);
      return output;
    }
    const toc = await inspect(['--list'], true);
    for (const object of ['TABLE DATA public projects ', 'TABLE DATA public users ', 'TABLE DATA auth users ', 'TABLE DATA storage objects ']) {
      if (!toc.includes(object)) throw Error('Required archive data entry missing');
    }
    await inspect(['--file=-', '--no-owner', '--no-acl'], false);
    const result = {
      checkedAt: new Date().toISOString(), payloadsVerified: verified.payloads,
      archiveReadable: true, entireArchiveDecoded: true,
      tableDataEntries: (toc.match(/ TABLE DATA /g) || []).length,
      publicTableDataEntries: (toc.match(/ TABLE DATA public /g) || []).length,
      authTableDataEntries: (toc.match(/ TABLE DATA auth /g) || []).length,
      storageTableDataEntries: (toc.match(/ TABLE DATA storage /g) || []).length,
      restoredToDatabase: false,
    };
    fs.writeFileSync(path.join(base, 'database-verification.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
    console.log(JSON.stringify(result, null, 2));
  } finally { key.fill(0); }
}
main().catch(() => { console.error('Database archive inspection failed; no secrets printed and no database modified.'); process.exitCode = 1; });
