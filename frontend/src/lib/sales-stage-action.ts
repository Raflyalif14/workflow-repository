import {isInitialSubmissionBeforeEffectiveStart} from './dates';

/** Matches the start-date and final-stage prerequisites enforced by the Start RPC. */
export function salesStageAction(status: string, startDate: string | null | undefined, isFinal: boolean, prerequisitesComplete: boolean) {
  if (status === 'IN_PROGRESS') return 'RESULT' as const;
  if (status !== 'CREATED') return null;
  if (isFinal && !prerequisitesComplete) return 'WAIT_WORK' as const;
  if (!startDate) return 'NO_SCHEDULE' as const;
  if (isInitialSubmissionBeforeEffectiveStart(startDate, false)) return 'WAIT_DATE' as const;
  return 'START' as const;
}
