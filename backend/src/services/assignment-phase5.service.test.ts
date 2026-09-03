import {
  AssignmentPhase5Service,
  assertAssignablePic,
  assertPicAssignmentActor,
  assertPicAssignmentChange,
  assertPicAssignmentProjectState,
} from './assignment-phase5.service';
import { supabaseAdmin } from '../config/supabase';

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

const assertThrows = (name: string, action: () => void): void => {
  try {
    action();
  } catch {
    console.log(`${name}: rejected`);
    return;
  }

  throw new Error(`${name}: expected rejection`);
};

const headSa = { userId: 'head-sa-1', role: 'HEAD_SA', fullName: 'Head SA Test' };
const sales = { userId: 'sales-1', role: 'SALES', fullName: 'Sales Test' };
const superAdmin = { userId: 'super-admin-1', role: 'SUPER_ADMIN', fullName: 'Super Admin Test' };
const activeProject = { pic_id: null, status: 'ACTIVE', is_postponed: false };
const activeSa = { id: 'sa-1', role: 'SA', is_active: true };
const activeHeadSa = { id: 'head-sa-1', role: 'HEAD_SA', is_active: true };

assertThrows('Test 1 - Non-HEAD_SA assignment', () => assertPicAssignmentActor(sales));
assertThrows('Test 1 - SUPER_ADMIN assignment', () => assertPicAssignmentActor(superAdmin));
assertThrows('Test 2 - Inactive SA assignment', () => assertAssignablePic({ ...activeSa, is_active: false }, headSa));
assertThrows('Test 3 - SALES target assignment', () => assertAssignablePic({ ...activeSa, role: 'SALES' }, headSa));
assertThrows('Test 4 - DRAFT project assignment', () =>
  assertPicAssignmentProjectState({ ...activeProject, status: 'DRAFT' })
);
assertThrows('Test 5 - POSTPONED project assignment', () =>
  assertPicAssignmentProjectState({ ...activeProject, status: 'POSTPONED', is_postponed: true })
);
assertThrows('Test 6 - COMPLETED project assignment', () =>
  assertPicAssignmentProjectState({ ...activeProject, status: 'COMPLETED' })
);

assertPicAssignmentActor(headSa);
assertPicAssignmentProjectState(activeProject);
assertAssignablePic(activeSa, headSa);
assertPicAssignmentChange(activeProject, activeSa.id);
console.log('Test 7 - ACTIVE project with active SA PIC: accepted');

assertThrows('Test 8 - Reassignment without reason', () =>
  assertPicAssignmentChange({ ...activeProject, pic_id: 'sa-old' }, activeSa.id)
);

assert(
  (() => {
    try {
      assertPicAssignmentProjectState({ ...activeProject, is_postponed: true });
      return false;
    } catch {
      return true;
    }
  })(),
  'Test 9: inconsistent ACTIVE + is_postponed=true must be rejected'
);
console.log('Test 9 - Inconsistent postponed state: rejected');

assertAssignablePic(activeHeadSa, headSa);
console.log('Test 10 - HEAD_SA can assign their own active account as PIC: accepted');

assertThrows('Test 11 - HEAD_SA cannot assign another HEAD_SA', () =>
  assertAssignablePic({ ...activeHeadSa, id: 'head-sa-2' }, headSa)
);
assertThrows('Test 12 - Inactive HEAD_SA self assignment', () =>
  assertAssignablePic({ ...activeHeadSa, is_active: false }, headSa)
);
assertThrows('Test 13 - SUPER_ADMIN target assignment', () =>
  assertAssignablePic({ ...activeHeadSa, id: superAdmin.userId, role: 'SUPER_ADMIN' }, headSa)
);

async function verifyAvailablePics(): Promise<void> {
  const originalFrom = supabaseAdmin.from;
  const calls: Array<[string, unknown]> = [];

  (supabaseAdmin as any).from = (table: string) => {
    assert(table === 'users', 'Test 14: available PICs must query users');
    const query: any = {
      select: () => query,
      eq: (field: string, value: unknown) => {
        calls.push([field, value]);
        return query;
      },
      or: (value: string) => {
        calls.push(['or', value]);
        return query;
      },
      order: () => Promise.resolve({ data: [], error: null }),
    };
    return query;
  };

  try {
    await AssignmentPhase5Service.availablePics(headSa);
    assert(calls.some(([field, value]) => field === 'is_active' && value === true), 'Test 14: available PICs must be active');
    assert(
      calls.some(([field, value]) => field === 'or' && value === 'role.eq.SA,and(role.eq.HEAD_SA,id.eq.head-sa-1)'),
      'Test 14: HEAD_SA list must include only active SAs and the actor themself'
    );

    calls.length = 0;
    await AssignmentPhase5Service.availablePics(superAdmin);
    assert(calls.some(([field, value]) => field === 'role' && value === 'SA'), 'Test 14: SUPER_ADMIN list must contain active SAs only');
    assert(!calls.some(([field]) => field === 'or'), 'Test 14: SUPER_ADMIN list must not include HEAD_SA users');
    console.log('Test 14 - Eligible PIC lists are actor-scoped: passed');
  } finally {
    (supabaseAdmin as any).from = originalFrom;
  }
}

verifyAvailablePics().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
