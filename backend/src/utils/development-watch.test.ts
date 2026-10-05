import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

type Ready = { port: number; marker: string; pid: number };
async function main() {
  const backendRoot = resolve(__dirname, '../..');
  const pkg = JSON.parse(readFileSync(join(backendRoot, 'package.json'), 'utf8'));
  const command: string[] = pkg.scripts.dev.split(' ');
  assert.equal(command[0], 'node');
  assert.equal(command.pop(), 'src/server.ts');
  assert(!pkg.devDependencies['ts-node-dev']);
  assert(pkg.devDependencies['ts-node']);
  const fixture = mkdtempSync(join(tmpdir(), 'workflow-dev-watch-'));
  const dependency = join(fixture, 'dependency.ts');
  writeFileSync(dependency, 'export const marker = "first";\n');
  const entry = join(fixture, 'entry.ts');
  writeFileSync(entry, `import { createServer } from 'node:http';
import { marker } from './dependency';
const server = createServer((req, res) => {
  res.end(marker);
  if (req.url === '/stop') server.close(() => process.exit(0));
}).listen(0, '127.0.0.1', () => console.log('WATCH_READY ' + JSON.stringify({
  port: (server.address() as any).port, marker, pid: process.pid
})));
process.once('SIGTERM', () => server.close(() => process.exit(0)));
`);
  const child = spawn(process.execPath, [...command.slice(1), entry], { cwd: backendRoot, windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'] });
  const ready: Ready[] = [];
  let output = '', errors = '';
  let waiter: { count: number; resolve: (value: Ready) => void; reject: (error: Error) => void; timer: NodeJS.Timeout } | undefined;
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
    let newline: number;
    while ((newline = output.indexOf('\n')) >= 0) {
      const line = output.slice(0, newline).trim(); output = output.slice(newline + 1);
      if (!line.startsWith('WATCH_READY ')) continue;
      ready.push(JSON.parse(line.slice('WATCH_READY '.length)));
      if (waiter && ready.length >= waiter.count) {
        clearTimeout(waiter.timer); waiter.resolve(ready[waiter.count - 1]); waiter = undefined;
      }
    }
  });
  child.stderr.on('data', (chunk) => { errors += chunk.toString(); });
  child.on('error', (error) => { waiter?.reject(error); });
  const waitReady = (count: number): Promise<Ready> => {
    if (ready.length >= count) return Promise.resolve(ready[count - 1]);
    return new Promise((resolveReady, reject) => {
      waiter = { count, resolve: resolveReady, reject,
        timer: setTimeout(() => reject(new Error('Development watcher did not start/restart: ' + errors)), 15000) };
    });
  };
  const read = (port: number, path = '/') => new Promise<string>((resolveBody, reject) => {
    const request = get({ hostname: '127.0.0.1', port, path }, (response) => {
      let body = ''; response.setEncoding('utf8'); response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolveBody(body)); response.on('error', reject);
    });
    request.setTimeout(5000, () => request.destroy(new Error('Fixture HTTP request timed out')));
    request.on('error', reject);
  });
  try {
    const first = await waitReady(1);
    assert.equal(await read(first.port), 'first');
    writeFileSync(dependency, 'export const marker = "restarted";\n');
    const second = await waitReady(2);
    assert.notEqual(second.pid, first.pid);
    assert.equal(await read(second.port), 'restarted', 'An imported TypeScript change restarts the server');
    await read(second.port, '/stop');
    console.log('Development watch: package command starts TS and restarts on imported-file change via local HTTP fixture');
  } finally {
    if (waiter) clearTimeout(waiter.timer);
    // Terminate only PIDs reported by this fixture, then its watch parent.
    for (const item of ready) {
      try { process.kill(item.pid); } catch (error: any) { if (error.code !== 'ESRCH') throw error; }
    }
    const exited = once(child, 'exit');
    if (child.exitCode === null) { child.kill(); await exited; }
    const absoluteFixture = resolve(fixture);
    assert.equal(dirname(absoluteFixture), resolve(tmpdir()));
    assert(basename(absoluteFixture).startsWith('workflow-dev-watch-'));
    rmSync(absoluteFixture, { recursive: true, force: true });
  }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
