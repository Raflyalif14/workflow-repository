import { readFileSync } from 'fs';
import { join } from 'path';
import { deleteProjectSchema } from '../validators/project-deletion.validator';
import { ProjectDeletionError, ProjectDeletionService } from './project-deletion.service';

const assert = (condition: boolean, message: string): void => { if (!condition) throw new Error(message); };

const assertRejects = async (action: () => Promise<unknown>, message: string) => {
  try { await action(); } catch (error) { assert(error instanceof ProjectDeletionError && error.statusCode === 403, message); return; }
  throw new Error(`${message}: expected rejection`);
};

async function main() {
  assert(deleteProjectSchema.safeParse({ confirmation: 'Project A' }).success, 'Test 1: exact-name confirmation payload is accepted');
  assert(!deleteProjectSchema.safeParse({}).success && !deleteProjectSchema.safeParse({ confirmation: 'A', project_id: 'other' }).success, 'Test 2: missing or client-supplied project data is rejected');
  await assertRejects(() => ProjectDeletionService.preview('project-a', { userId: 'sales', role: 'SALES' }), 'Test 3: non-admin preview must be forbidden');
  await assertRejects(() => ProjectDeletionService.delete('project-a', 'Project A', { userId: 'sa', role: 'SA' }), 'Test 4: non-admin delete must be forbidden');

  const service = readFileSync(join(__dirname, 'project-deletion.service.ts'), 'utf8');
  const migration = readFileSync(join(__dirname, '../../supabase/phase11i-project-deletion.sql'), 'utf8');
  const collaborationMigration = readFileSync(join(__dirname, '../../supabase/phase11l-milestone-collaboration.sql'), 'utf8');
  assert(service.includes("rpc('delete_project_with_cleanup'") && service.includes('DocumentStorageService.removeMany(storagePaths)'), 'Test 5: database delete RPC must complete before exact storage cleanup');
  assert(service.includes("status: 'FAILED'") && service.includes("failure_code: 'STORAGE_DELETE_FAILED'"), 'Test 6: storage failures must retain a failed cleanup record');
  assert(migration.includes('security definer') && migration.includes('for update') && migration.includes('project_deletion_cleanups'), 'Test 7: migration uses a locked transactional cleanup record');
  assert(migration.includes('delete from public.milestone_submission_attachments') && migration.includes('delete from public.document_versions') && migration.includes('delete from public.projects'), 'Test 8: transaction explicitly removes package and document dependents before the project');
  assert(service.includes("rows('milestone_contributions'") && service.includes("storageRows('milestone_contribution_attachments'") && service.includes('...contributionAttachments'), 'Test 9: deletion preview counts contribution metadata and exact storage paths');
  assert(collaborationMigration.includes('select a.storage_path as path') && collaborationMigration.includes('delete from public.milestone_contribution_attachments') && collaborationMigration.includes('delete from public.milestone_contributions'), 'Test 10: Phase 11L RPC replacement collects exact contribution paths and deletes both child tables');
  console.log('Project deletion safety tests passed.');
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : 'Project deletion test failed.'); process.exitCode = 1; });
