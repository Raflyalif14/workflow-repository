export type DeadlineEvent = {
  id: string;
  name: string;
  status: string;
  dueDate: string;
  project: { id: string; name: string; status: string; is_postponed: boolean };
};

export type DeadlineCalendarData = { month: string; items: DeadlineEvent[] };
