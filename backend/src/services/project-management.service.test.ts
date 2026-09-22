import { assertProjectCanResume, assertProjectOutcomeCanBeRecorded } from './project-management.service';
import { projectOutcomeSchema } from '../validators/project-management.validator';

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

const assertThrows = (name: string, action: () => void): void => {
  try {
    action();
  } catch (error) {
    assert(error instanceof Error && error.message === 'Only POSTPONED projects can be resumed.', `${name}: unexpected error`);
    console.log(`${name}: rejected`);
    return;
  }

  throw new Error(`${name}: expected rejection`);
};

assertProjectCanResume({ status: 'POSTPONED', is_postponed: true });
console.log('Test 1 - POSTPONED + is_postponed=true can resume: passed');

assertThrows('Test 2 - POSTPONED + is_postponed=false', () =>
  assertProjectCanResume({ status: 'POSTPONED', is_postponed: false })
);
assertThrows('Test 3 - ACTIVE + is_postponed=true', () =>
  assertProjectCanResume({ status: 'ACTIVE', is_postponed: true })
);
assertThrows('Test 4 - ACTIVE + is_postponed=false', () =>
  assertProjectCanResume({ status: 'ACTIVE', is_postponed: false })
);
assertThrows('Test 5 - POSTPONED + is_postponed=null', () =>
  assertProjectCanResume({ status: 'POSTPONED', is_postponed: null })
);

const sales = { userId: 'sales-1', role: 'SALES', fullName: 'Sales Test' };
assertProjectOutcomeCanBeRecorded({ sales_id: sales.userId, status: 'WAITING_RESULT' }, sales);
console.log('Test 6 - Owning Sales can record a WAITING_RESULT outcome: passed');

const assertOutcomeRejected = (name: string, project: { sales_id: string | null; status: string }, actor: typeof sales, expectedMessage: string) => {
  try {
    assertProjectOutcomeCanBeRecorded(project, actor);
  } catch (error) {
    assert(error instanceof Error && error.message === expectedMessage, `${name}: unexpected error`);
    console.log(`${name}: rejected`);
    return;
  }

  throw new Error(`${name}: expected rejection`);
};

assertOutcomeRejected(
  'Test 7 - Non-owning Sales cannot record an outcome',
  { sales_id: 'sales-owner', status: 'WAITING_RESULT' },
  sales,
  'Forbidden'
);
assertOutcomeRejected(
  'Test 8 - Outcome cannot be recorded before delivery is complete',
  { sales_id: sales.userId, status: 'ACTIVE' },
  sales,
  'Only projects waiting for a result can be marked WON or LOST.'
);
assertOutcomeRejected(
  'Test 9 - SA cannot record a tender outcome',
  { sales_id: sales.userId, status: 'WAITING_RESULT' },
  { userId: 'sa-1', role: 'SA', fullName: 'SA Test' },
  'Forbidden'
);

assert(projectOutcomeSchema.safeParse({ outcome: 'WON', final_contract_value: 250000000 }).success, 'Test 10: WON must accept a positive final contract value');
assert(!projectOutcomeSchema.safeParse({ outcome: 'WON' }).success, 'Test 11: WON must require a final contract value');
assert(projectOutcomeSchema.safeParse({ outcome: 'LOST', loss_reason: 'Customer selected another vendor.' }).success, 'Test 12: LOST must accept a reason');
assert(!projectOutcomeSchema.safeParse({ outcome: 'LOST' }).success, 'Test 13: LOST must require a reason');
assert(!projectOutcomeSchema.safeParse({ outcome: 'WON', final_contract_value: 250000000, loss_reason: 'Not applicable' }).success, 'Test 14: WON must not accept a loss reason');
assert(!projectOutcomeSchema.safeParse({ outcome: 'LOST', loss_reason: 'Customer selected another vendor.', final_contract_value: 250000000 }).success, 'Test 15: LOST must not accept a final contract value');
console.log('Test 10-15 - Tender outcome details are validated by outcome: passed');
