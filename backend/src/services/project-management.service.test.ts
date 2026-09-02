import { assertProjectCanResume } from './project-management.service';

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
