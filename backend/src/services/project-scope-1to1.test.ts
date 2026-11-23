import assert from 'node:assert/strict';
import {
  scopeRequestSchema,
  scopeReviewSchema,
  ScopeChangeError,
  ProjectScopeChangeService,
} from './project-scope-change.service';

function testScopeSchemas() {
  const validRequest = {
    request_id: '11111111-1111-4111-8111-111111111111',
    expected_updated_at: '2026-11-19T10:00:00.000Z',
    reason: 'Permintaan penambahan scope dokumen teknis oleh klien',
    selected_keys: ['proposal_deck_solusi', 'kajian_teknis'],
    additions: [
      {
        key: 'kajian_teknis',
        start_date: '2026-11-20',
        duration_working_days: 3,
      },
    ],
  };

  // 1. Valid request parses successfully
  const parsed = scopeRequestSchema.parse(validRequest);
  assert.equal(parsed.reason, validRequest.reason);
  assert.equal(parsed.additions.length, 1);
  assert.equal(parsed.additions[0].duration_working_days, 3);

  // 2. Duplicate additions are rejected
  assert.throws(() => {
    scopeRequestSchema.parse({
      ...validRequest,
      additions: [
        { key: 'kajian_teknis', start_date: '2026-11-20', duration_working_days: 2 },
        { key: 'kajian_teknis', start_date: '2026-11-22', duration_working_days: 1 },
      ],
    });
  });

  // 3. Duplicate selected keys are rejected
  assert.throws(() => {
    scopeRequestSchema.parse({
      ...validRequest,
      selected_keys: ['proposal_deck_solusi', 'proposal_deck_solusi'],
    });
  });

  // 4. Invalid date format in additions is rejected
  assert.throws(() => {
    scopeRequestSchema.parse({
      ...validRequest,
      additions: [
        { key: 'kajian_teknis', start_date: '20-11-2026', duration_working_days: 2 },
      ],
    });
  });

  // 5. Zero or negative duration is rejected
  assert.throws(() => {
    scopeRequestSchema.parse({
      ...validRequest,
      additions: [
        { key: 'kajian_teknis', start_date: '2026-11-20', duration_working_days: 0 },
      ],
    });
  });

  // 6. Review schema: REJECTED requires a non-empty note
  assert.throws(() => {
    scopeReviewSchema.parse({
      request_id: '11111111-1111-4111-8111-111111111111',
      decision: 'REJECTED',
      note: '',
    });
  });

  // 7. Review schema: APPROVED allows empty note
  const approved = scopeReviewSchema.parse({
    request_id: '11111111-1111-4111-8111-111111111111',
    decision: 'APPROVED',
  });
  assert.equal(approved.decision, 'APPROVED');

  // 8. Review schema: CANCELLED allows empty note
  const cancelled = scopeReviewSchema.parse({
    request_id: '11111111-1111-4111-8111-111111111111',
    decision: 'CANCELLED',
  });
  assert.equal(cancelled.decision, 'CANCELLED');

  console.log('project-scope-1to1: schema validation, duplicate key prevention, additions scheduling, and review note guards all passed.');
}

async function testRoleAuthorizationAndErrorMapping() {
  const actorSA = { userId: 'sa-user-1', role: 'SA' };
  const actorSales = { userId: 'sales-user-1', role: 'SALES' };
  const actorHeadSA = { userId: 'head-sa-user-1', role: 'HEAD_SA' };

  // SA cannot create scope request
  await assert.rejects(
    async () => {
      await ProjectScopeChangeService.mutate(
        '11111111-1111-4111-8111-111111111111',
        undefined,
        {
          request_id: '22222222-2222-4222-8222-222222222222',
          expected_updated_at: '2026-11-19T10:00:00.000Z',
          reason: 'Test',
          selected_keys: ['a'],
          additions: [],
        },
        actorSA
      );
    },
    (err: any) => err instanceof ScopeChangeError && err.statusCode === 403 && err.code === 'SCOPE_FORBIDDEN'
  );

  // Sales cannot review/approve scope request
  await assert.rejects(
    async () => {
      await ProjectScopeChangeService.mutate(
        '11111111-1111-4111-8111-111111111111',
        '33333333-3333-4333-8333-333333333333',
        {
          request_id: '44444444-4444-4444-8444-444444444444',
          decision: 'APPROVED',
        },
        actorSales
      );
    },
    (err: any) => err instanceof ScopeChangeError && err.statusCode === 403 && err.code === 'SCOPE_FORBIDDEN'
  );

  // Head SA cannot cancel (only requester/sales can cancel)
  await assert.rejects(
    async () => {
      await ProjectScopeChangeService.mutate(
        '11111111-1111-4111-8111-111111111111',
        '33333333-3333-4333-8333-333333333333',
        {
          request_id: '44444444-4444-4444-8444-444444444444',
          decision: 'CANCELLED',
        },
        actorHeadSA
      );
    },
    (err: any) => err instanceof ScopeChangeError && err.statusCode === 403 && err.code === 'SCOPE_FORBIDDEN'
  );

  console.log('project-scope-1to1: role guards for request/review/cancel passed.');
}

async function run() {
  testScopeSchemas();
  await testRoleAuthorizationAndErrorMapping();
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
