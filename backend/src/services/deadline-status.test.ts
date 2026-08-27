import { DeadlineService, DeadlineStatus } from './deadline.service';

type Case = {
  name: string;
  milestoneStatus: string;
  dueDate: string | null;
  today: string;
  holidays?: string[];
  expectedStatus: DeadlineStatus;
  expectedRemaining: number | null | ((value: number | null) => boolean);
};

const cases: Case[] = [
  {
    name: 'Test 1 - NOT_SET',
    milestoneStatus: 'PENDING',
    dueDate: null,
    today: '2026-08-28',
    expectedStatus: 'NOT_SET',
    expectedRemaining: null,
  },
  {
    name: 'Test 2 - ON_TRACK with holiday',
    milestoneStatus: 'PENDING',
    dueDate: '2026-09-04',
    today: '2026-08-28',
    holidays: ['2026-08-31'],
    expectedStatus: 'ON_TRACK',
    expectedRemaining: (value) => typeof value === 'number' && value > 2,
  },
  {
    name: 'Test 3 - DUE_SOON',
    milestoneStatus: 'PENDING',
    dueDate: '2026-09-04',
    today: '2026-09-03',
    expectedStatus: 'DUE_SOON',
    expectedRemaining: 2,
  },
  {
    name: 'Test 4 - OVERDUE',
    milestoneStatus: 'PENDING',
    dueDate: '2026-09-01',
    today: '2026-09-02',
    expectedStatus: 'OVERDUE',
    expectedRemaining: (value) => typeof value === 'number' && value < 0,
  },
  {
    name: 'Test 5 - COMPLETED',
    milestoneStatus: 'COMPLETED',
    dueDate: '2026-09-01',
    today: '2026-09-10',
    expectedStatus: 'COMPLETED',
    expectedRemaining: 0,
  },
];

for (const item of cases) {
  const result = DeadlineService.calculateDeadlineStatus(
    item.milestoneStatus,
    item.dueDate,
    item.today,
    item.holidays || []
  );

  if (result.deadline_status !== item.expectedStatus) {
    throw new Error(`${item.name}: expected ${item.expectedStatus}, got ${result.deadline_status}`);
  }

  const remainingMatches = typeof item.expectedRemaining === 'function'
    ? item.expectedRemaining(result.remaining_working_days)
    : result.remaining_working_days === item.expectedRemaining;

  if (!remainingMatches) {
    throw new Error(`${item.name}: unexpected remaining_working_days ${result.remaining_working_days}`);
  }

  console.log(`${item.name}: ${result.deadline_status}, remaining=${result.remaining_working_days}`);
}
