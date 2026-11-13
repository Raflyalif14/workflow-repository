import { addWorkingDays } from './dates';

type Case = {
  name: string;
  startDate: string;
  duration: number;
  holidays?: string[];
  expected: string;
};

const toDateOnlyKey = (date: Date): string => date.toISOString().slice(0, 10);

const cases: Case[] = [
  {name: 'Start is day zero', startDate: '2026-11-12', duration: 1, expected: '2026-11-13'},
  {name: 'Two days skip weekend', startDate: '2026-11-12', duration: 2, expected: '2026-11-16'},
  {name: 'Zero leaves date unchanged', startDate: '2026-11-12', duration: 0, expected: '2026-11-12'},
  {name: 'Cross year and holiday', startDate: '2026-12-31', duration: 1, holidays: ['2027-01-01'], expected: '2027-01-04'},
  {
    name: 'Test 1 - Monday, duration 5 ends next Monday',
    startDate: '2026-08-24',
    duration: 5,
    expected: '2026-08-31',
  },
  {
    name: 'Test 2 - Friday, duration 3 ends Wednesday',
    startDate: '2026-08-28',
    duration: 3,
    expected: '2026-09-02',
  },
  {
    name: 'Test 3 - Friday, Monday holiday, duration 3 ends Thursday',
    startDate: '2026-08-28',
    duration: 3,
    holidays: ['2026-08-31'],
    expected: '2026-09-03',
  },
  {
    name: 'Test 4 - Saturday, duration 1 ends Monday',
    startDate: '2026-08-29',
    duration: 1,
    expected: '2026-08-31',
  },
  {
    name: 'Test 5 - Monday holiday, duration 1 ends Tuesday',
    startDate: '2026-08-24',
    duration: 1,
    holidays: ['2026-08-24'],
    expected: '2026-08-25',
  },
];

for (const item of cases) {
  const actual = toDateOnlyKey(addWorkingDays(item.startDate, item.duration, item.holidays || []));
  if (actual !== item.expected) {
    throw new Error(`${item.name}: expected ${item.expected}, got ${actual}`);
  }

  console.log(`${item.name}: ${actual}`);
}
