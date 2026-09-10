export class DeadlineError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
    readonly internalError?: unknown
  ) {
    super(message);
    this.name = 'DeadlineError';
  }
}

const domainErrorStatus = new Map<string, number>([
  ['Forbidden', 403],
  ['Milestone not found', 404],
  ['Project not found', 404],
  ['Deadline approval not found', 404],
  ['Deadline history not found', 404],
  ['A deadline change request is already pending approval.', 409],
  ['Deadline approval is no longer pending.', 400],
  ['note is required', 400],
  ['Project is postponed.', 400],
  ['Deadline changes are only available for ACTIVE projects.', 400],
  ['Deadline changes can only be reviewed for ACTIVE projects.', 400],
  ['Completed milestone deadline cannot be changed.', 400],
  ['Completed milestone deadline approval cannot be reviewed.', 400],
  ['Reason is required when changing an existing deadline.', 400],
]);

export function toSafeDeadlineError(error: unknown, fallback: string): DeadlineError {
  if (error instanceof DeadlineError) return error;

  const message = error instanceof Error ? error.message : '';
  const statusCode = domainErrorStatus.get(message);
  if (statusCode) return new DeadlineError(message, statusCode);

  return new DeadlineError(fallback, 500, error);
}

export function logUnexpectedDeadlineError(operation: string, error: DeadlineError): void {
  if (error.statusCode < 500) return;

  const detail = error.internalError;
  const errorDetail = detail instanceof Error
    ? detail.message
    : typeof detail === 'string'
      ? detail
      : detail ?? 'Unknown internal error';

  console.error('[DeadlineController] Unexpected deadline operation failure.', {
    operation,
    error: errorDetail,
  });
}
