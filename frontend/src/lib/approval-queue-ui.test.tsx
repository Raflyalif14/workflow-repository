import assert from 'node:assert/strict';
import Module from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { setActiveLanguage, getActiveLanguage, translate } from '../i18n';

const originalLoad = (Module as any)._load;
let user: any = { id: 'head', role: 'HEAD_SA' };
let query: any = { data: { stats: { totalPending: 1, pendingDocs: 1, pendingProjectPlans: 0, pendingDeadlines: 0 }, items: [{
  id: 'output:o', category: 'OUTPUT_DOCUMENT', status: 'PENDING', isCurrentApproval: true,
  projectId: 'p', projectName: 'User project with a long unmodified name', projectCode: 'p', clientName: 'Customer',
  title: 'Timeline Proyek', documentKey: 'timeline_proyek', milestoneName: 'User milestone', milestoneId: 'm',
  phaseName: 'On Submission Tender', outputId: 'o', snapshotId: 'v', versionNumber: 2, fileCount: 3,
  submittedBy: '', submittedAt: '', requestedAt: '', canReview: true, reviewBlockedReason: null,
}] }, isLoading: false, isError: false, isFetching: false, refetch: () => { throw new Error('Rendering must not refetch/mutate'); } };
(Module as any)._load = function(name: string, ...args: any[]) {
  if (name.endsWith('/auth-provider') || name === './auth-provider') return { useAuth: () => ({ user, isLoading: false }) };
  if (name.endsWith('/language-provider')) return { useLanguage: () => ({ t: translate, locale: getActiveLanguage() }) };
  if (name.endsWith('/use-approvals')) return { useApprovalOverview: (enabled: boolean) => { assert(enabled); return query; } };
  if (name.endsWith('/approval-action-dialog')) return { ApprovalActionDialog: () => null };
  // Icons are presentation-only in this Node fixture; no browser layout is asserted.
  if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => key === '__esModule' ? true : (props: any) => React.createElement('span', { ...props, 'aria-hidden': true }) });
  if (name === 'next/navigation') return { useRouter: () => ({ push: () => { throw new Error('Rendering must not navigate'); } }) };
  return originalLoad.call(this, name, ...args);
};
try {
  const Page = require('../app/approvals/page').default;
  const render = () => renderToStaticMarkup(React.createElement(Page));
  for (const locale of ['en', 'id'] as const) {
    setActiveLanguage(locale);
    let html = render();
    assert(html.includes(translate('outputQueue.category')));
    assert(html.includes(translate('outputQueue.openReview')));
    assert(html.includes(translate('outputQueue.snapshot', { version: 2, count: 3 })));
    assert(html.includes('User project with a long unmodified name'));
    assert(!html.includes(`>${translate('common.approve')}</button>`)); assert(!html.includes(`>${translate('common.reject')}</button>`));
    query.data.items[0].canReview = false; query.data.items[0].reviewBlockedReason = 'POSTPONED';
    html = render(); assert(html.includes(translate('outputQueue.viewOutput'))); assert(html.includes(translate('outputQueue.POSTPONED')));
    query.isError = true; html = render(); assert(html.includes(translate('outputQueue.stale'))); assert(html.includes(translate('outputQueue.retry')));
    query.isError = false; query.data.items[0].canReview = true; query.data.items[0].reviewBlockedReason = null;
  }
  query.data = undefined; query.isLoading = true;
  assert(render().includes('—'), 'Missing data is shown as unavailable, not valid zero');
  query.isLoading = false; query.isError = true;
  assert(render().includes(translate('approval.loadError')));
  user = { id: 'sales', role: 'SALES' }; assert(render().includes(translate('ui.accessRestricted')));
  user = { id: 'sa', role: 'SA' }; assert(render().includes(translate('ui.accessRestricted')));
  user = { id: 'admin', role: 'SUPER_ADMIN' };
  query = { ...query, isError: false, data: { stats: { totalPending: 0, pendingDocs: 0, pendingProjectPlans: 0, pendingDeadlines: 0 }, items: [] } };
  assert(render().includes(translate('approvalUi.queueClear')));
  console.log('Approvals actual page isolated render: EN/ID output rows, snapshot/unknown submitter, no inline decisions, blocked/stale/error/loading/empty states and role guard passed.');
} finally { (Module as any)._load = originalLoad; setActiveLanguage('en'); }
