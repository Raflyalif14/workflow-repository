import assert from 'node:assert/strict';
import { supabaseAdmin } from '../config/supabase';
import { ProjectDeletionService } from './project-deletion.service';

async function main() {
  const originalFrom = supabaseAdmin.from;
  const registryRanges: number[] = [];
  const registry = Array.from({ length: 251 }, (_, index) => ({
    id: `asset-${String(index).padStart(3, '0')}`, storage_path: `test-project/asset-${index}`,
  }));
  try {
    (supabaseAdmin as any).from = (table: string) => {
      let start = 0;
      let end = Infinity;
      const query: any = {
        select: () => query, eq: () => query, in: () => query, order: () => query,
        range: (from: number, to: number) => { start = from; end = to; if (table === 'project_output_document_files') registryRanges.push(from); return query; },
        maybeSingle: async () => ({ data: { id: 'test-project', name: 'Test', status: 'ACTIVE', scenario: null }, error: null }),
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
          const source = table === 'project_output_document_files' ? registry
            : table === 'project_output_documents' ? [{ id: 'output-1', storage_path: registry[0].storage_path }]
            : table === 'project_output_document_versions' ? [{ id: 'version-1', storage_path: registry[0].storage_path }]
            : [];
          return Promise.resolve({ data: source.slice(start, end + 1), error: null }).then(resolve, reject);
        },
      };
      return query;
    };
    const preview = await ProjectDeletionService.preview('test-project', { userId: 'admin', role: 'SUPER_ADMIN' });
    assert.equal(preview.project_output_document_file_count, 251, 'Count retained assets, including files removed from the working draft');
    assert.equal(preview.storage_object_count, 251, 'Deduplicate legacy metadata and the immutable registry for exact cleanup count');
    assert.deepEqual(registryRanges, [0, 250], 'Read all file registry pages rather than truncating retained assets');
    assert(!JSON.stringify(preview).includes('storage_path') && !JSON.stringify(preview).includes('asset-250'), 'Preview returns counts without private storage references');
  } finally {
    supabaseAdmin.from = originalFrom;
  }
  console.log('Project deletion retained output-file preview: passed');
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
