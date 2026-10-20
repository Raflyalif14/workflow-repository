'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const exclusions = require('./ci-exclusions.cjs');
const { testEnvironment } = require('./test-environment.cjs');
const root = path.resolve(__dirname, '..');
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(item =>
  item.isDirectory() ? walk(path.join(directory, item.name)) : [path.join(directory, item.name)]);

const tests = [...walk(path.join(root, 'src')).filter(file => /\.test\.ts$/.test(file)),
  ...walk(__dirname).filter(file => /\.test\.cjs$/.test(file))]
  .map(file => path.relative(root, file).split(path.sep).join('/')).sort();
for (const excluded of Object.keys(exclusions)) {
  if (!tests.includes(excluded)) throw new Error('Stale backend CI exclusion: ' + excluded);
}
const args = process.argv.slice(2);
const listOnly = args[0] === '--list';
if (args.length > 1 || args[0]?.startsWith('--') && !listOnly) throw new Error('Usage: node tests/run-ci.cjs [--list | name-filter]');
const filter = listOnly ? undefined : args[0];
const selected = tests.filter(file => !filter || file.includes(filter));
if (!selected.length) throw new Error('No backend tests matched.');

let failed = 0, passed = 0, excludedCount = 0;
for (const test of selected) {
  if (Object.hasOwn(exclusions, test)) {
    excludedCount++;
    console.log('EXCLUDED ' + test + ': ' + exclusions[test]);
    continue;
  }
  if (listOnly) { console.log('RUN ' + test); continue; }
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-backend-ci-'));
  let result;
  try {
    result = spawnSync(process.execPath, [path.join(__dirname, 'run-one-ci.cjs'), path.join(root, test)], {
      cwd: root, env: { ...testEnvironment(process.env), BACKEND_CI_TEMP_ROOT: temporaryRoot }, encoding: 'utf8',
      timeout: 60000, maxBuffer: 4 * 1024 * 1024, windowsHide: true,
    });
  } finally {
    const absolute = path.resolve(temporaryRoot);
    if (path.dirname(absolute) !== path.resolve(os.tmpdir()) || !path.basename(absolute).startsWith('workflow-backend-ci-'))
      throw new Error('Unexpected backend CI cleanup path.');
    // Also remove fixture data if a timed-out child could not run its exit handler.
    fs.rmSync(absolute, { recursive: true, force: true });
  }
  if (result.status !== 0 || result.error) {
    failed++;
    console.error('FAIL ' + test);
    console.error(result.error?.message || result.stderr || result.stdout || 'Test process failed.');
  } else { passed++; console.log('PASS ' + test); }
}
if (listOnly) console.log(`${selected.length - excludedCount} selected; ${excludedCount} require a separate environment.`);
else console.log(`\n${passed}/${selected.length - excludedCount} backend CI test files passed; ${failed} failed; ${excludedCount} require a separate environment.`);
process.exitCode = failed || !listOnly && passed === 0 ? 1 : 0;
