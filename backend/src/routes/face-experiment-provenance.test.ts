import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const { startFixture } = require('../../tests/face-experiment-fixture.cjs');
async function run() {
  const fixture = await startFixture();
  const form = (broken = false) => {
    const body = new FormData();
    for (const slot of ['A', 'B']) {
      const bytes = broken && slot === 'A' ? Buffer.from('synthetic-invalid') : fs.readFileSync(path.resolve('../services/face-experiment/tests/fixtures/same-person-' + slot.toLowerCase() + '.jpg'));
      body.append('photo' + slot, new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }), 'fixture.jpg');
    }
    return body;
  };
  try {
    const request = (body: FormData) => fetch(fixture.origin + '/api/face-experiment/compare', { method: 'POST', headers: { Authorization: 'Bearer fixture-provenance' }, body });
    const response = await request(form()); assert.equal(response.status, 200);
    const { data } = await response.json();
    const manifest = JSON.parse(fs.readFileSync(path.resolve('../services/face-experiment/models-manifest.json'), 'utf8'));
    assert.deepEqual(Object.keys(data).sort(), ['metric', 'model', 'provenance', 'score']);
    assert.equal(data.provenance.modelSha256, manifest.models.find((m: any) => m.file.includes('sface')).sha256);
    assert.equal(data.provenance.detectorSha256, manifest.models.find((m: any) => m.file.includes('yunet')).sha256);
    assert.equal(data.provenance.preprocessingVersion, 'opencv-sface-five-landmark-112-v1');
    assert.equal(data.provenance.embeddingDimensions, 128);
    assert.equal(data.provenance.runtimeVersion, '4.13.0');
    const failed = await request(form(true)); assert.equal(failed.status, 422);
    const error = await failed.json(); assert.equal(error.errors.code, 'FACE_IMAGE_INVALID');
    assert.deepEqual(error.errors.provenance, data.provenance); assert.equal(error.data, undefined);
    assert(!JSON.stringify(error).includes('storage_path'));
    console.log('Real Node/Python provenance: verified asset checksums, preprocessing/runtime version, safe success projection and failure metadata passed. Synthetic public fixtures only.');
  } finally { await fixture.close(); }
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
