import { installRestrictedRepositoryFixture } from '../test-utils/repository-access.fixture';
import { strict as assert } from 'assert';
import { supabaseAdmin } from '../config/supabase';
import { DocumentStorageService } from '../utils/storage.util';
import { OutputDocumentService } from './output-document.service';

type Row = Record<string, any>;
const projects: Row[] = [
  { id: 'p1', name: 'Owner project', customer: 'Customer A', sales_id: 'sales-1', pic_id: 'sa-1', status: 'ACTIVE' },
  { id: 'p2', name: 'Other project', customer: 'Customer B', sales_id: 'sales-2', pic_id: 'sa-2' },
  { id: 'p3', name: 'Completed project', customer: 'Customer C', sales_id: 'sales-1', pic_id: 'sa-1', status: 'WON' },
];
const outputs: Row[] = [
  { project_id: 'p1', document_key: 'proposal_teknis', title: 'Internal proposal', is_required: true, is_selected: true, status: 'IN_REVIEW', file_name: 'internal.pdf', storage_path: 'private/internal', current_version_id: 'v1' },
  { project_id: 'p1', document_key: 'timeline_proyek', title: 'Approved timeline', is_required: true, is_selected: true, status: 'APPROVED', file_name: 'approved.pdf', storage_path: 'private/approved', current_version_id: 'v2' },
  { project_id: 'p1', document_key: 'metodologi_implementasi', title: 'Selected methodology', is_required: false, is_selected: true, status: 'APPROVED', file_name: 'selected.pdf', storage_path: 'private/selected', current_version_id: 'v6' },
  { project_id: 'p1', document_key: 'arsitektur_sistem', title: 'Optional unselected', is_required: false, is_selected: false, status: 'APPROVED', file_name: 'optional.pdf', storage_path: 'private/optional', current_version_id: 'v3' },
  { project_id: 'p2', document_key: 'proposal_teknis', title: 'Other internal', is_required: true, is_selected: true, status: 'REVISION_REQUIRED', file_name: 'other-internal.pdf', storage_path: 'private/other-internal', current_version_id: 'v4' },
  { project_id: 'p2', document_key: 'timeline_proyek', title: 'Other approved', is_required: true, is_selected: true, status: 'APPROVED', file_name: 'other-approved.pdf', storage_path: 'private/other-approved', current_version_id: 'v5' },
  { project_id: 'p2', document_key: 'identitas_barang_produk', title: 'Missing file', is_required: true, is_selected: true, status: 'DRAFT', file_name: null, storage_path: null, current_version_id: null },
  { project_id: 'p3', document_key: 'proposal_teknis', title: 'Completed output', is_required: true, is_selected: true, status: 'APPROVED', file_name: 'finished.pdf', storage_path: 'private/finished', current_version_id: 'v7' },
  { project_id: 'p3', document_key: 'timeline_proyek', title: 'Broken current version', is_required: true, is_selected: true, status: 'APPROVED', file_name: 'broken.pdf', storage_path: 'private/broken', current_version_id: 'missing-version' },
  { project_id: 'p3', document_key: 'identitas_barang_produk', title: 'Wrong current version owner', is_required: true, is_selected: true, status: 'APPROVED', file_name: 'wrong.pdf', storage_path: 'private/wrong', current_version_id: 'v2' },
];
outputs.forEach((row, index) => { row.id = `output-${index + 1}`; });
const versionOwners = [0, 1, 3, 4, 5, 2, 7];
const versions = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7'].map((id, index) => ({
  id, version_number: index + 1, output_document_id: outputs[versionOwners[index]].id,
  project_id: outputs[versionOwners[index]].project_id, status: outputs[versionOwners[index]].status, snapshot_kind: 'LEGACY_SUBMITTED',
}));
const files = versions.map((version) => {
  const output = outputs.find((row) => row.id === version.output_document_id)!;
  return { id: `file-${version.id}`, output_document_id: output.id, project_id: output.project_id,
    file_name: output.file_name, storage_path: output.storage_path, file_size: 256, mime_type: 'application/pdf', uploaded_at: '2026-10-02T00:00:00Z' };
});
const references = versions.map((version) => ({ version_id: version.id, output_document_id: version.output_document_id,
  project_id: version.project_id, file_id: `file-${version.id}`, position: 0 }));

class QueryMock {
  private filters: Array<(row: Row) => boolean> = [];
  private start = 0;
  private end = Infinity;
  constructor(private table: string) {}
  select() { return this; }
  eq(column: string, value: unknown) { this.filters.push((row) => row[column] === value); return this; }
  in(column: string, values: unknown[]) { this.filters.push((row) => values.includes(row[column])); return this; }
  or() { this.filters.push((row) => row.is_required === true || row.is_selected === true); return this; }
  not(column: string) { this.filters.push((row) => row[column] !== null && row[column] !== undefined); return this; }
  order() { return this; }
  range(start: number, end: number) { this.start = start; this.end = end; return this; }
  then(resolve: (value: { data: Row[]; error: null }) => unknown, reject?: (reason: unknown) => unknown) {
    const source = this.table === 'projects' ? projects : this.table === 'project_output_documents' ? outputs
      : this.table === 'project_output_document_versions' ? versions : this.table === 'project_output_document_files' ? files : references;
    return Promise.resolve({ data: source.filter((row) => this.filters.every((filter) => filter(row))).slice(this.start, this.end + 1), error: null }).then(resolve, reject);
  }
}

async function main() {
  const originalFrom = supabaseAdmin.from;
  const originalSigned = DocumentStorageService.createSignedDownloadUrl;
  let signedCalls = 0;
  const restoreAccessFixture = installRestrictedRepositoryFixture({ 'sales-1':'SALES','sales-2':'SALES','sales-3':'SALES','sa-1':'SA','sa-2':'SA','sa-3':'SA','head-1':'HEAD_SA','admin-1':'SUPER_ADMIN' }, () => ({ projects, outputs }));
  try {
    (supabaseAdmin as any).from = (table: string) => new QueryMock(table);
    (DocumentStorageService as any).createSignedDownloadUrl = async () => { signedCalls++; return 'signed'; };
    const actor = (role: string, userId: string) => ({ role, userId, fullName: role });
    const sales = await OutputDocumentService.listAccessibleFiles(actor('SALES', 'sales-1'));
    assert.deepEqual(sales.map((row) => row.name), ['Approved timeline', 'Selected methodology', 'Completed output']);
    assert(!JSON.stringify(sales).includes('internal'));
    const otherSales = await OutputDocumentService.listAccessibleFiles(actor('SALES', 'sales-3'));
    assert.deepEqual(otherSales, []);
    const secondSales = await OutputDocumentService.listAccessibleFiles(actor('SALES', 'sales-2'));
    assert.deepEqual(secondSales.map((row) => row.name), ['Other approved']);
    const pic = await OutputDocumentService.listAccessibleFiles(actor('SA', 'sa-1'));
    assert.deepEqual(pic.map((row) => row.name), ['Approved timeline', 'Selected methodology', 'Completed output']);
    const searchPic = await OutputDocumentService.listAccessibleFiles(actor('SA', 'sa-1'), { approvedOnly: false });
    assert.deepEqual(searchPic.map((row) => row.name), ['Internal proposal', 'Approved timeline', 'Selected methodology', 'Completed output']);
    const otherSa = await OutputDocumentService.listAccessibleFiles(actor('SA', 'sa-3'));
    assert.deepEqual(otherSa, []);
    const secondPic = await OutputDocumentService.listAccessibleFiles(actor('SA', 'sa-2'));
    assert.deepEqual(secondPic.map((row) => row.name), ['Other approved']);
    const head = await OutputDocumentService.listAccessibleFiles(actor('HEAD_SA', 'head-1'));
    assert.equal(head.length, 4);
    const admin = await OutputDocumentService.listAccessibleFiles(actor('SUPER_ADMIN', 'admin-1'));
    assert.deepEqual(admin.map((row) => row.name), ['Approved timeline', 'Selected methodology', 'Other approved', 'Completed output']);
    for (const row of [...sales, ...secondSales, ...pic, ...secondPic, ...head, ...admin]) {
      assert(!('storage_path' in row) && !('url' in row));
      assert(row.versionNumber > 0);
      assert.equal(row.files.length, 1);
      assert(!JSON.stringify(row.files).includes('storage_path'));
    }
    files.push({ ...files[1], id: 'file-v2-second' });
    references.push({ ...references[1], file_id: 'file-v2-second', position: 1 });
    const multiFile = await OutputDocumentService.listAccessibleFiles(actor('SALES', 'sales-1'));
    assert.equal(multiFile.length, 3, 'Repository counter counts outputs, not constituent files');
    const approved = multiFile.find((row) => row.name === 'Approved timeline')!;
    assert.deepEqual(approved.files.map((file) => file.id), ['file-v2', 'file-v2-second']);
    assert.equal(approved.approvedVersionId, 'v2');
    assert(!JSON.stringify(approved).includes('private/approved'), 'Lists never expose Storage paths');
    files.pop(); references.pop();
    const originalVersionProject = versions[1].project_id;
    versions[1].project_id = 'p2';
    const mismatchedVersion = await OutputDocumentService.listAccessibleFiles(actor('SALES', 'sales-1'));
    assert(!mismatchedVersion.some((row) => row.name === 'Approved timeline'), 'A snapshot from another project is never listed');
    versions[1].project_id = originalVersionProject;
    const originalFileProject = files[1].project_id;
    files[1].project_id = 'p2';
    await assert.rejects(() => OutputDocumentService.listAccessibleFiles(actor('SALES', 'sales-1')),
      (error: any) => error.statusCode === 500, 'A mismatched immutable file reference fails closed');
    files[1].project_id = originalFileProject;
    const originalOutputCount = outputs.length;
    const originalProjectCount = projects.length;
    const originalVersionCount = versions.length;
    const originalFileCount = files.length;
    const originalReferenceCount = references.length;
    for (let index = 0; index < 251; index++) {
      projects.push({ id: `extra-${index}`, name: `Extra ${index}`, customer: 'Customer', sales_id: 'sales-1', pic_id: 'sa-1' });
      outputs.push({ ...outputs[1], id: `extra-output-${index}`, project_id: `extra-${index}`,
        current_version_id: `extra-version-${index}`, title: `Output past project page ${index}` });
      versions.push({ id: `extra-version-${index}`, output_document_id: `extra-output-${index}`,
        project_id: `extra-${index}`, version_number: 1, status: 'APPROVED', snapshot_kind: 'SUBMITTED' });
      files.push({ ...files[1], id: `extra-file-${index}`, output_document_id: `extra-output-${index}`, project_id: `extra-${index}` });
      references.push({ version_id: `extra-version-${index}`, output_document_id: `extra-output-${index}`,
        project_id: `extra-${index}`, file_id: `extra-file-${index}`, position: 0 });
    }
    const manyProjects = await OutputDocumentService.listAccessibleFiles(actor('SALES', 'sales-1'));
    assert.equal(manyProjects.length, 254, 'Accessible project, output, and file-reference pagination includes every unique persisted output');
    assert(manyProjects.some((row) => row.name === 'Output past project page 250'), 'Later projects remain included');
    const globalPages = await OutputDocumentService.listAccessibleFiles(actor('HEAD_SA', 'head-1'));
    assert.equal(globalPages.length, 255, 'Global output listing must continue past its first page');
    projects.length = originalProjectCount;
    outputs.length = originalOutputCount;
    versions.length = originalVersionCount;
    files.length = originalFileCount;
    references.length = originalReferenceCount;
    assert.equal(signedCalls, 0, 'Listing must never generate signed URLs');
    console.log('Output repository list: role scopes, non-final metadata and URL safety passed');
  } finally {
    restoreAccessFixture();
    supabaseAdmin.from = originalFrom;
    DocumentStorageService.createSignedDownloadUrl = originalSigned;
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
