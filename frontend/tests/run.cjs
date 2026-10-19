'use strict';
const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory()
  ? walk(path.join(dir, item.name)) : [path.join(dir, item.name)]);
const filter = process.argv[2];
const files = [...walk(path.join(root, 'src')).filter(file => /\.test\.tsx?$/.test(file)), path.join(__dirname, 'face-detection-assets.cjs')]
  .filter(file => !filter || path.relative(root, file).includes(filter)).sort();
if (!files.length) { console.error('No tests matched the requested name.'); process.exit(1); }
let failed = 0;
for (const file of files) {
  const name = path.relative(root, file).replaceAll('\\', '/');
  const result = spawnSync(process.execPath, [path.join(__dirname, 'run-one.cjs'), file], {
    cwd: root, encoding: 'utf8', timeout: 90000, maxBuffer: 4 * 1024 * 1024, windowsHide: true,
    env: { ...process.env, NODE_ENV: 'test', SUPABASE_URL: 'https://example.invalid',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key', SUPABASE_ANON_KEY: 'test-anon-key' },
  });
  if (result.status !== 0 || result.error) {
    failed++; console.error('FAIL ' + name);
    console.error(result.stderr || result.stdout || result.error?.message || 'Process failed');
  } else console.log('PASS ' + name);
}
console.log(`\n${files.length - failed}/${files.length} test files passed.`);
process.exitCode = failed ? 1 : 0;
