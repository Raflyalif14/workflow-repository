export type DateInput = Date | string;
export type HolidayInput =
  | DateInput
  | {
      date?: DateInput;
      holiday_date?: DateInput;
      is_active?: boolean;
    };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const parseDateOnlyString = (value: string): Date => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) throw new Error(`Invalid date value: ${value}`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid date value: ${value}`);
  }

  return date;
};

const toDateOnly = (date: DateInput): Date => {
  if (typeof date === 'string') return parseDateOnlyString(date);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date value');

  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

const toDateOnlyKey = (date: DateInput): string => toDateOnly(date).toISOString().slice(0, 10);

const getHolidayDate = (holiday: HolidayInput): DateInput | null => {
  if (holiday instanceof Date || typeof holiday === 'string') return holiday;
  if (holiday.is_active === false) return null;
  return holiday.date || holiday.holiday_date || null;
};

const addCalendarDays = (date: Date, days: number): Date =>
  new Date(date.getTime() + days * MS_PER_DAY);

export const isWeekend = (date: DateInput): boolean => {
  const day = toDateOnly(date).getUTCDay();
  return day === 0 || day === 6;
};

export const isHoliday = (date: DateInput, holidays: HolidayInput[] = []): boolean => {
  const dateKey = toDateOnlyKey(date);
  return holidays.some((holiday) => {
    const holidayDate = getHolidayDate(holiday);
    return holidayDate ? toDateOnlyKey(holidayDate) === dateKey : false;
  });
};

export const isWorkingDay = (date: DateInput, holidays: HolidayInput[] = []): boolean =>
  !isWeekend(date) && !isHoliday(date, holidays);

export const addWorkingDays = (
  startDate: DateInput,
  durationWorkingDays: number,
  holidays: HolidayInput[] = []
): Date => {
  if (!Number.isInteger(durationWorkingDays) || durationWorkingDays < 0) {
    throw new Error('durationWorkingDays must be a non-negative integer');
  }

  let currentDate = toDateOnly(startDate);
  if (durationWorkingDays === 0) return currentDate;

  let countedDays = 0;
  while (countedDays < durationWorkingDays) {
    if (isWorkingDay(currentDate, holidays)) countedDays += 1;
    if (countedDays < durationWorkingDays) currentDate = addCalendarDays(currentDate, 1);
  }

  return currentDate;
};

export const calculateWorkingDaysBetween = (
  startDate: DateInput,
  endDate: DateInput,
  holidays: HolidayInput[] = []
): number => {
  let currentDate = toDateOnly(startDate);
  const finalDate = toDateOnly(endDate);
  if (currentDate.getTime() > finalDate.getTime()) return 0;

  let workingDays = 0;
  while (currentDate.getTime() <= finalDate.getTime()) {
    if (isWorkingDay(currentDate, holidays)) workingDays += 1;
    currentDate = addCalendarDays(currentDate, 1);
  }

  return workingDays;
};

export const getRemainingWorkingDays = (
  today: DateInput,
  dueDate: DateInput,
  holidays: HolidayInput[] = []
): number => calculateWorkingDaysBetween(today, dueDate, holidays);
