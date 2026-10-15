'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../public/vendor/mediapipe/1.1.0');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const pkg = require('../package.json'), installed = require('../node_modules/@mediapipe/tasks-vision/package.json');
assert.equal(pkg.dependencies['@mediapipe/tasks-vision'], manifest.version);
assert.equal(installed.version, manifest.version);
assert.equal(manifest.license, 'Apache-2.0');
for (const [name, expected] of Object.entries(manifest.files)) {
  const bytes = fs.readFileSync(path.join(root, name));
  assert.equal(bytes.length, expected.bytes, name);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), expected.sha256, name);
  if (name === 'vision_bundle.js' || name.startsWith('wasm/'))
    assert(bytes.equals(fs.readFileSync(path.join(__dirname, '../node_modules/@mediapipe/tasks-vision', name))), 'Vendored package asset differs: ' + name);
}
const fixtureRoot = path.join(__dirname, 'fixtures/face-detection');
const fixture = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'manifest.json'), 'utf8'));
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(fixtureRoot, fixture.file))).digest('hex'), fixture.sha256);
console.log('Pinned MediaPipe package/WASM/model and licensed fixture SHA-256 checks passed');
