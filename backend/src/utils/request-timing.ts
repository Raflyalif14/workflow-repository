import { randomUUID } from 'crypto';
import { performance } from 'perf_hooks';
import { NextFunction, Request, Response } from 'express';

type TimedRoute = 'auth.me' | 'approvals.overview' | 'dashboard.overview' | 'projects.list';
export type TimingOperation =
  | 'auth.verify' | 'auth.profile' | 'auth.me.profile'
  | 'approval.output_reviews' | 'approval.projects' | 'approval.milestones_and_plans' | 'approval.deadline_approvals' | 'approval.history_and_users'
  | 'dashboard.projects' | 'dashboard.base_queries' | 'dashboard.approvals_and_users' | 'dashboard.sa_users'
  | 'projects.list.rows' | 'projects.list.milestones';

export type RequestTiming = {
  record: (operation: TimingOperation | 'request.total', durationMs: number) => void;
};

const traces = new WeakMap<Request, RequestTiming>();
const routeNames: Record<string, TimedRoute> = {
  '/api/auth/me': 'auth.me',
  '/api/approvals/overview': 'approvals.overview',
  '/api/dashboard': 'dashboard.overview',
  '/api/dashboard/': 'dashboard.overview',
  '/api/projects': 'projects.list',
};

export function requestTiming(req: Request, res: Response, next: NextFunction): void {
  const route = req.method === 'GET' ? routeNames[req.path] : undefined;
  if (process.env.NODE_ENV !== 'development' || process.env.PERF_DIAGNOSTICS !== '1' || !route) {
    next();
    return;
  }

  const correlationId = randomUUID();
  const startedAt = performance.now();
  const trace: RequestTiming = {
    record: (operation, durationMs) => console.info(JSON.stringify({ correlationId, operation: operation === 'request.total' ? `${route}.request.total` : operation, durationMs: Number(durationMs.toFixed(1)) })),
  };
  traces.set(req, trace);
  res.setHeader('X-Perf-Trace-Id', correlationId);
  res.once('finish', () => trace.record('request.total', performance.now() - startedAt));
  next();
}

export const getRequestTiming = (req: Request): RequestTiming | undefined => traces.get(req);

export async function timeOperation<T>(trace: RequestTiming | undefined, operation: TimingOperation, action: () => T | PromiseLike<T>): Promise<Awaited<T>> {
  if (!trace) return await action();
  const startedAt = performance.now();
  try {
    return await action();
  } finally {
    trace.record(operation, performance.now() - startedAt);
  }
}
