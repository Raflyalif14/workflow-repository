import { installRestrictedRepositoryFixture } from '../test-utils/repository-access.fixture';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { supabaseAdmin } from '../config/supabase';
import { DocumentStorageService } from '../utils/storage.util';
import { MAX_OUTPUT_ARCHIVE_SOURCE_BYTES, OutputDocumentService } from './output-document.service';

async function main() {
  const project = { id: 'p', name: 'Project', sales_id: 'sales', pic_id: 'sa', status: 'ACTIVE' };
  const docs: any[] = [{ id: 'o', project_id: 'p', current_version_id: 'v', document_key: 'proposal_teknis', status: 'APPROVED' }];
  const versions: any[] = [{ id: 'v', project_id: 'p', output_document_id: 'o', status: 'APPROVED' }];
  const refs = [1, 2].map((n) => ({ version_id: 'v', output_document_id: 'o', project_id: 'p', file_id: `f${n}`, position: n }));
  const files = [1, 2].map((n) => ({ id: `f${n}`, project_id: 'p', output_document_id: 'o', file_name: 'same.pdf',
    file_size: 3 as number | null, storage_path: `private-${n}`, mime_type: 'application/pdf' }));
  let signs = 0, fetches = 0, cancelled = false;
  const restoreAccessFixture = installRestrictedRepositoryFixture({ sales:'SALES',sa:'SA',head:'HEAD_SA',admin:'SUPER_ADMIN' }, () => ({ projects: [project], outputs: docs }));
  let body = 'abc', failFetch = false;
  class Query {
    filters: Array<(row: any) => boolean> = [];
    constructor(private table: string) {}
    select() { return this; }
    eq(k: string, v: unknown) { this.filters.push((r) => r[k] === v); return this; }
    in(k: string, values: unknown[]) { this.filters.push((r) => values.includes(r[k])); return this; }
    or() { return this; }
    order() { return this; }
    range() { return this; }
    result(single = false) {
      const rows = (this.table === 'projects' ? [project] : this.table === 'project_output_documents' ? docs
        : this.table === 'project_output_document_versions' ? versions : this.table === 'project_output_document_version_files' ? refs
          : this.table === 'project_output_document_files' ? files : []).filter((r) => this.filters.every((f) => f(r)));
      return { data: single ? rows[0] : rows, error: null };
    }
    single() { return Promise.resolve(this.result(true)); }
    maybeSingle() { return this.single(); }
    then(resolve: any, reject: any) { return Promise.resolve(this.result()).then(resolve, reject); }
  }
  const originals = { from: supabaseAdmin.from, sign: DocumentStorageService.createSignedDownloadUrl, fetch: global.fetch };
  try {
    (supabaseAdmin as any).from = (table: string) => new Query(table);
    (DocumentStorageService as any).createSignedDownloadUrl = async () => { signs++; return 'not-exposed'; };
    global.fetch = (async () => {
      fetches++;
      if (failFetch && fetches % 2 === 0) return new Response(null, { status: 404 });
      let sent = false;
      return { ok: true, body: { getReader: () => ({ read: async () => sent ? { done: true } :
        (sent = true, { done: false, value: Buffer.from(body) }), cancel: async () => { cancelled = true; }, releaseLock() {} }) } } as any;
    }) as typeof fetch;
    const download = () => OutputDocumentService.downloadAllApproved('p', { userId: 'sales', role: 'SALES', fullName: 'Sales' });
    files[0].file_size = files[1].file_size = 50 * 1024 * 1024;
    refs.push({ ...refs[0], file_id: 'f3' }); files.push({ ...files[0], id: 'f3', file_size: 1 });
    await assert.rejects(download, (error: any) => error.statusCode === 413);
    assert.equal(MAX_OUTPUT_ARCHIVE_SOURCE_BYTES, 100 * 1024 * 1024);
    assert.equal(fetches + signs, 0, 'Excessive total rejected before Storage access');
    refs.pop(); files.pop(); files[0].file_size = null; files[1].file_size = 3;
    await assert.rejects(download, (error: any) => error.message.includes('sizes cannot be verified'));
    assert.equal(fetches + signs, 0, 'Unknown legacy size cannot produce an unbounded archive');
    files[0].file_size = 3;
    docs.push({ ...docs[0], id: 'missing-output', current_version_id: null });
    await assert.rejects(download, (error: any) => error.statusCode === 409);
    assert.equal(fetches + signs, 0, 'Broken approved snapshot cannot be silently omitted');
    docs.pop();
    await assert.rejects(() => OutputDocumentService.downloadAllApproved('p', { userId: 'other-sales', role: 'SALES', fullName: 'Other' }));
    assert.equal(fetches + signs, 0, 'Access guard runs before signing');
    const { zipBuffer } = await download();
    const entries: Array<{ name: string; data: string }> = [];
    for (let offset = 0; zipBuffer.readUInt32LE(offset) === 0x04034b50;) {
      const size = zipBuffer.readUInt32LE(offset + 18), nameSize = zipBuffer.readUInt16LE(offset + 26);
      const extra = zipBuffer.readUInt16LE(offset + 28), start = offset + 30 + nameSize + extra;
      const method = zipBuffer.readUInt16LE(offset + 8);
      const compressed = zipBuffer.subarray(start, start + size);
      entries.push({ name: zipBuffer.toString('utf8', offset + 30, offset + 30 + nameSize),
        data: (method === 8 ? inflateRawSync(compressed) : compressed).toString() });
      offset = start + size;
    }
    assert.equal(entries.length, 2, 'Archive includes every approved snapshot file');
    assert.equal(new Set(entries.map((entry) => entry.name)).size, 2);
    assert(entries.every((entry) => entry.data === 'abc'));
    body = 'abcd';
    await assert.rejects(download, (error: any) => error.message.includes('complete archive'));
    assert(cancelled, 'Actual body larger than verified metadata is cancelled');
    body = 'ab';
    await assert.rejects(download, (error: any) => error.message.includes('complete archive'));
    body = 'abc'; failFetch = true; fetches = 0;
    await assert.rejects(download, (error: any) => error.message.includes('complete archive'));
    assert.equal(fetches, 2, 'Missing later object fails the whole archive, without a partial ZIP');
    console.log('Output archive: size preflight, bounded body, complete snapshots and access passed');
  } finally {
    restoreAccessFixture();
    supabaseAdmin.from = originals.from; DocumentStorageService.createSignedDownloadUrl = originals.sign; global.fetch = originals.fetch;
  }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
