import { strict as assert } from 'assert';
import { supabaseAdmin } from '../config/supabase';
import { projectDetailQuerySchema } from '../validators/project-management.validator';
import { ProjectManagementService } from './project-management.service';

const project = { id: 'project-1', name: 'Example', sales_id: 'sales-1', pic_id: 'sa-1' };
const activity = { id: 'log-1', user_id: 'sales-1', action: 'PROJECT_CREATED', description: 'Created', created_at: '2026-09-01T08:00:00Z' };
const owner = { userId: 'sales-1', role: 'SALES', fullName: 'Owner' };
const outsider = { userId: 'sales-2', role: 'SALES', fullName: 'Outsider' };

async function withDatabase<T>(action: (tables: string[]) => Promise<T>): Promise<T> {
  const tables: string[] = [];
  const originalFrom = supabaseAdmin.from;
  try {
    (supabaseAdmin as any).from = (table: string) => {
      tables.push(table);
      const query = {
        select: () => query,
        eq: () => query,
        order: () => Promise.resolve({ data: [activity], error: null }),
        single: () => Promise.resolve({ data: project, error: null }),
      };
      return query;
    };
    return await action(tables);
  } finally {
    supabaseAdmin.from = originalFrom;
  }
}

async function run() {
  assert.equal(projectDetailQuerySchema.parse({}).include_activity, 'true');
  assert.equal(projectDetailQuerySchema.parse({ include_activity: 'false' }).include_activity, 'false');
  assert.equal(projectDetailQuerySchema.safeParse({ include_activity: 'invalid' }).success, false);

  await withDatabase(async (tables) => {
    const result = await ProjectManagementService.get(project.id, owner, { includeActivity: false });
    assert.deepEqual(tables, ['projects'], 'detail without activity must never query activity_logs');
    assert.equal('activity_logs' in result, false, 'reduced response omits activity_logs');
    assert.equal(result.id, project.id);
  });

  await withDatabase(async (tables) => {
    const result = await ProjectManagementService.get(project.id, owner);
    assert.deepEqual(tables, ['projects', 'activity_logs'], 'default detail retains the activity query');
    assert('activity_logs' in result, 'default detail retains the activity_logs field');
    assert.deepEqual(result.activity_logs, [{ ...activity, details: activity.description }]);
  });

  await withDatabase(async (tables) => {
    await assert.rejects(() => ProjectManagementService.get(project.id, outsider, { includeActivity: false }), /Project not found/);
    assert.deepEqual(tables, ['projects'], 'access must be checked before any activity query');
  });
  await withDatabase(async (tables) => {
    await assert.rejects(() => ProjectManagementService.get(project.id, outsider), /Project not found/);
    assert.deepEqual(tables, ['projects'], 'default detail must enforce project access too');
  });
  console.log('Project detail activity option, default contract, and access: passed');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
