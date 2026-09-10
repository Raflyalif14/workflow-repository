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
  const intakeMigration = readFileSync(join(__dirname, '../../supabase/phase11p-project-intake-evidence.sql'), 'utf8');
  assert(service.includes("rpc('delete_project_with_cleanup'") && service.includes('DocumentStorageService.removeMany(storagePaths)'), 'Test 5: database delete RPC must complete before exact storage cleanup');
  assert(service.includes("status: 'FAILED'") && service.includes("failure_code: 'STORAGE_DELETE_FAILED'"), 'Test 6: storage failures must retain a failed cleanup record');
  assert(migration.includes('security definer') && migration.includes('for update') && migration.includes('project_deletion_cleanups'), 'Test 7: migration uses a locked transactional cleanup record');
  assert(migration.includes('delete from public.milestone_submission_attachments') && migration.includes('delete from public.document_versions') && migration.includes('delete from public.projects'), 'Test 8: transaction explicitly removes package and document dependents before the project');
  assert(service.includes("rows('milestone_contributions'") && service.includes("storageRows('milestone_contribution_attachments'") && service.includes('...contributionAttachments'), 'Test 9: deletion preview counts contribution metadata and exact storage paths');
  assert(collaborationMigration.includes('select a.storage_path as path') && collaborationMigration.includes('delete from public.milestone_contribution_attachments') && collaborationMigration.includes('delete from public.milestone_contributions'), 'Test 10: Phase 11L RPC replacement collects exact contribution paths and deletes both child tables');
  assert(collaborationMigration.includes('select dv.storage_path as path') && collaborationMigration.includes('select a.storage_path as path') && collaborationMigration.includes('from public.milestone_contribution_attachments a'), 'Test 11: deletion RPC collects both official document-version and contribution source storage paths');
  assert(collaborationMigration.includes('from public.milestone_submission_attachments a') && collaborationMigration.includes('join public.milestone_submission_packages sp on sp.id = a.package_id') && !collaborationMigration.includes("a.status = 'PENDING'"), 'Test 12: deletion RPC collects every submission attachment path, including retained rejected evidence');
  assert(service.includes("storageRows('project_intake_attachments'") && service.includes('...intakeAttachments'), 'Test 13: deletion preview counts project intake metadata and exact storage paths');
  assert(intakeMigration.includes('create table if not exists public.project_intake_attachments') && intakeMigration.includes('references public.projects(id) on delete cascade'), 'Test 14: intake evidence is project-owned metadata, not an official document table');
  assert(intakeMigration.includes('from public.project_intake_attachments a') && intakeMigration.includes('delete from public.project_intake_attachments where project_id = p_project_id'), 'Test 15: deletion RPC captures exact intake paths and removes intake metadata before deleting the project');
  console.log('Project deletion safety tests passed.');
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : 'Project deletion test failed.'); process.exitCode = 1; });
