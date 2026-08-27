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
  {
    name: 'Test 1 - Monday, duration 5 ends Friday',
    startDate: '2026-08-24',
    duration: 5,
    expected: '2026-08-28',
  },
  {
    name: 'Test 2 - Friday, duration 3 ends Tuesday',
    startDate: '2026-08-28',
    duration: 3,
    expected: '2026-09-01',
  },
  {
    name: 'Test 3 - Friday, Monday holiday, duration 3 ends Wednesday',
    startDate: '2026-08-28',
    duration: 3,
    holidays: ['2026-08-31'],
    expected: '2026-09-02',
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
