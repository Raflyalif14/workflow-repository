import type { ApprovalFilters, ApprovalItem } from '@/types/approval';
import { translateOutputName, type AppLanguage } from '@/i18n';

export function approvalQueuePage(items: readonly ApprovalItem[], filters: ApprovalFilters, history: boolean, page: number, size = 20, language: AppLanguage = 'en') {
  const search = filters.search?.trim().toLowerCase() || '';
  const filtered = items.filter(item => (filters.type === undefined || filters.type === 'ALL' || item.category === filters.type)
    && (history ? item.status !== 'PENDING' : item.status === 'PENDING' && item.isCurrentApproval !== false)
    && (!filters.status || filters.status === 'ALL' || item.status === filters.status)
    && (!search || [item.title, item.category === 'OUTPUT_DOCUMENT' ? translateOutputName(item.documentKey || '', item.title, language) : '', item.projectName, item.clientName, item.milestoneName, item.submittedBy,
      item.documentKey, item.phaseName, item.requestNote, item.reviewNote].filter(Boolean).join(' ').toLowerCase().includes(search)));
  filtered.sort((a, b) => {
    const time = (value: string) => Date.parse(value) || 0;
    const difference = time(a.requestedAt) - time(b.requestedAt);
    return (history ? -difference : difference) || `${a.category}:${a.id}`.localeCompare(`${b.category}:${b.id}`);
  });
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const currentPage = Math.min(pages, Math.max(1, page));
  return { total: filtered.length, pages, page: currentPage, items: filtered.slice((currentPage - 1) * size, currentPage * size) };
}

export const planAndDeadlineApprovals = (items: readonly ApprovalItem[]) => items.filter(item => item.category !== 'OUTPUT_DOCUMENT');

export function outputReviewHref(item: Pick<ApprovalItem, 'projectId' | 'milestoneId' | 'outputId' | 'snapshotId'>) {
  return `/projects/${encodeURIComponent(item.projectId)}#project-milestone-${encodeURIComponent(item.milestoneId || '')}?output=${encodeURIComponent(item.outputId || '')}&snapshot=${encodeURIComponent(item.snapshotId || '')}`;
}

export function outputReviewTarget(hash: string) {
  if (!hash.startsWith('#project-milestone-')) return null;
  const query = hash.indexOf('?');
  if (query < 0) return null;
  const params = new URLSearchParams(hash.slice(query + 1));
  const outputId = params.get('output'), snapshotId = params.get('snapshot');
  return outputId && snapshotId ? { outputId, snapshotId } : null;
}

export const outputReviewIsStale = (target: ReturnType<typeof outputReviewTarget>, document: { id: string; status: string; currentVersionId?: string | null }) =>
  Boolean(target && target.outputId === document.id && (document.status !== 'IN_REVIEW' || target.snapshotId !== document.currentVersionId));

export function resolvedOutputReviewHash(hash: string, saved: { outputId?: string; snapshotId: string }[]): string {
  const target = outputReviewTarget(hash);
  if (!target || !saved.some(item => item.outputId === target.outputId && item.snapshotId === target.snapshotId)) return hash;
  const query = hash.indexOf('?'), params = new URLSearchParams(hash.slice(query + 1));
  params.delete('output'); params.delete('snapshot');
  return hash.slice(0, query) + (params.size ? `?${params}` : '');
}

// Call only with the exact snapshots confirmed successful by this request.
// A stale deep link opened later, failed review or another snapshot remains stale.
export function clearResolvedOutputReviewLink(saved: { outputId?: string; snapshotId: string }[]) {
  if (typeof window === 'undefined') return;
  try {
    const hash = window.location.hash, next = resolvedOutputReviewHash(hash, saved);
    if (next === hash) return;
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${next}`);
    window.dispatchEvent(new Event('hashchange'));
  } catch {
    // URL presentation cannot turn a confirmed database success into a failed review.
  }
}

export function focusOutputReviewLink(hash: string, milestoneId: string, root: Pick<Document, 'getElementById'>) {
  const linkedOutput = outputReviewTarget(hash);
  const target = (linkedOutput && root.getElementById(`project-output-${linkedOutput.outputId}`))
    || root.getElementById(`project-milestone-${milestoneId}`);
  const history = target?.closest('details');
  if (history) history.open = true;
  target?.scrollIntoView({ block: 'start' });
  target?.focus({ preventScroll: true });
}
