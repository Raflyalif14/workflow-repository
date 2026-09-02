import {
  assertAssignablePic,
  assertPicAssignmentActor,
  assertPicAssignmentChange,
  assertPicAssignmentProjectState,
} from './assignment-phase5.service';

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
const activeProject = { pic_id: null, status: 'ACTIVE', is_postponed: false };
const activeSa = { id: 'sa-1', role: 'SA', is_active: true };

assertThrows('Test 1 - Non-HEAD_SA assignment', () => assertPicAssignmentActor(sales));
assertThrows('Test 2 - Inactive SA assignment', () => assertAssignablePic({ ...activeSa, is_active: false }));
assertThrows('Test 3 - Non-SA assignment', () => assertAssignablePic({ ...activeSa, role: 'SALES' }));
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
assertAssignablePic(activeSa);
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
