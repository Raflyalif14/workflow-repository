import { supabaseAdmin } from '../config/supabase';

export type MonitoringActor = { role: string; isActive: boolean };
export type MonitoringPage = { page: number; limit: number };
export type CleanupFilter = 'ALL' | 'PENDING' | 'FAILED' | 'COMPLETED';

export class OperationalHealthError extends Error {
  constructor(message = 'Unable to load operational health.', readonly statusCode = 500) {
    super(message);
  }
}

export function assertMonitoringAccess(actor: MonitoringActor) {
  if (!actor.isActive || actor.role !== 'SUPER_ADMIN') throw new OperationalHealthError('Forbidden', 403);
}

const count = async (query: any): Promise<number> => {
  const result = await query;
  if (result.error) throw result.error;
  return result.count || 0;
};
const allowedCategories = new Set(['REFERENCE', 'DUPLICATE', 'INVALID_DATA', 'PERMISSION', 'UNKNOWN']);
const allowedOperations = new Set(['notifications.insert', 'notification_deliveries.insert', 'output_notification_outbox.mark_delivered']);
const safeCode = (value: unknown, allowed: Set<string>) => typeof value === 'string' && allowed.has(value) ? value : null;
const safeSqlstate = (value: unknown) => typeof value === 'string' && /^[A-Z0-9]{5}$/.test(value) ? value : null;

export class OperationalHealthService {
  static async outputOutbox(actor: MonitoringActor, { page, limit }: MonitoringPage) {
    assertMonitoringAccess(actor);
    try {
      const pendingQuery = () => supabaseAdmin.from('output_notification_outbox').select('id', { count: 'exact', head: true }).is('delivered_at', null);
      const [pending, previouslyFailed, oldestResult, latestResult, pageResult] = await Promise.all([
        count(pendingQuery()),
        count(pendingQuery().gt('attempt_count', 0)),
        supabaseAdmin.from('output_notification_outbox').select('created_at').is('delivered_at', null)
          .order('created_at', { ascending: true }).order('id', { ascending: true }).limit(1),
        supabaseAdmin.from('output_notification_outbox').select('last_attempt_at').is('delivered_at', null)
          .not('last_attempt_at', 'is', null).order('last_attempt_at', { ascending: false }).limit(1),
        supabaseAdmin.from('output_notification_outbox')
          .select('id,created_at,attempt_count,last_attempt_at,last_error_category,last_error_sqlstate,last_error_operation')
          .is('delivered_at', null).order('created_at', { ascending: false }).order('id', { ascending: false })
          .range((page - 1) * limit, page * limit - 1),
      ]);
      if (oldestResult.error || latestResult.error || pageResult.error) throw new Error('Outbox query failed');
      return {
        generatedAt: new Date().toISOString(),
        summary: {
          pending,
          previouslyFailed,
          oldestCreatedAt: oldestResult.data?.[0]?.created_at || null,
          oldestAgeSeconds: oldestResult.data?.[0]?.created_at
            ? Math.max(0, Math.floor((Date.now() - Date.parse(oldestResult.data[0].created_at)) / 1000)) : null,
          latestAttemptAt: latestResult.data?.[0]?.last_attempt_at || null,
        },
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(pending / limit)),
        items: (pageResult.data || []).map((row: any) => ({
          id: row.id,
          createdAt: row.created_at,
          attemptCount: row.attempt_count,
          lastAttemptAt: row.last_attempt_at,
          errorCategory: safeCode(row.last_error_category, allowedCategories),
          sqlstate: safeSqlstate(row.last_error_sqlstate),
          errorOperation: safeCode(row.last_error_operation, allowedOperations),
        })),
      };
    } catch {
      throw new OperationalHealthError();
    }
  }

  static async storageCleanups(actor: MonitoringActor, { page, limit }: MonitoringPage, status: CleanupFilter) {
    assertMonitoringAccess(actor);
    try {
      const allQuery = () => supabaseAdmin.from('project_deletion_cleanups').select('id', { count: 'exact', head: true });
      let pageQuery = supabaseAdmin.from('project_deletion_cleanups')
        .select('id,created_at,updated_at,failed_at,completed_at,status,storage_object_count,failure_code')
        .order('created_at', { ascending: false }).order('id', { ascending: false })
        .range((page - 1) * limit, page * limit - 1);
      if (status !== 'ALL') pageQuery = pageQuery.eq('status', status);
      const [total, pending, failed, completed, pageResult] = await Promise.all([
        count(allQuery()),
        count(allQuery().eq('status', 'PENDING')),
        count(allQuery().eq('status', 'FAILED')),
        count(allQuery().eq('status', 'COMPLETED')),
        pageQuery,
      ]);
      if (pageResult.error) throw new Error('Cleanup query failed');
      const matching = status === 'PENDING' ? pending : status === 'FAILED' ? failed : status === 'COMPLETED' ? completed : total;
      return {
        summary: { total, pending, failed, completed },
        status,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(matching / limit)),
        items: (pageResult.data || []).map((row: any) => ({
          id: row.id,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          failedAt: row.failed_at,
          completedAt: row.completed_at,
          status: row.status,
          storageObjectCount: row.storage_object_count,
          failureCode: row.failure_code === 'STORAGE_DELETE_FAILED' ? row.failure_code : null,
          attemptCount: null,
        })),
      };
    } catch {
      throw new OperationalHealthError();
    }
  }
}
