import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkloadDetails } from '../components/dashboard/workload-details';
import { SolutionArchitectWorkloadPanel } from '../components/dashboard/solution-architect-workload-panel';
import { setActiveLanguage, translate } from '../i18n';
import type { DashboardSaWorkload } from '../types/dashboard';

const item: DashboardSaWorkload = { saId:'sa',saName:'Architect One',activeProjectCount:1,activeMilestoneCount:1,
  overdueCount:0,revisionCount:0,waitingReviewCount:0,nearestDeadline:'2026-11-10',
  workItems:[{id:'m',projectId:'p',projectName:'Customer project',name:'Technical proposal',status:'IN_PROGRESS',
    dueDate:'2026-11-10',startDate:'2026-11-02',activeWork:true}] };
for (const locale of ['en','id'] as const) {
  setActiveLanguage(locale);
  const html = renderToStaticMarkup(<WorkloadDetails item={item}/>);
  assert(html.includes('Technical proposal') && html.includes('Customer project'));
  assert(html.includes('/projects/p#project-milestone-m'));
  assert(html.includes(translate('copy.activeWork')));
  const empty = renderToStaticMarkup(<WorkloadDetails item={{...item,workItems:[]}}/>);
  assert(empty.includes(translate('workloadDetail.empty')));
  const unavailable = renderToStaticMarkup(<WorkloadDetails item={{...item,workItems:undefined}}/>);
  assert(unavailable.includes(translate('workloadDetail.unavailable')));
  const panel = renderToStaticMarkup(<SolutionArchitectWorkloadPanel workload={[item]} loading={false} hasError={false}/>);
  assert(panel.includes(translate('workloadDetail.show')) && panel.includes('aria-expanded="false"'));
}
// Exercise the expand/collapse controls with the component's actual state setter.
const originalState = React.useState;
let expanded: string | null = null;
try {
  (React as any).useState = () => [expanded, (update: any) => { expanded = typeof update === 'function' ? update(expanded) : update; }];
  const renderPanel = () => SolutionArchitectWorkloadPanel({workload:[item],loading:false,hasError:false});
  const findButton = (node: any): any => {
    if (!node || typeof node !== 'object') return undefined;
    if (node.type === 'button' && node.props['aria-controls'] === 'workload-desktop-sa') return node;
    return React.Children.toArray(node.props?.children).map(findButton).find(Boolean);
  };
  findButton(renderPanel()).props.onClick({stopPropagation() {}});
  assert.equal(expanded, 'sa');
  const open = renderPanel();
  assert.equal(findButton(open).props['aria-expanded'], true);
  assert(renderToStaticMarkup(open).includes('Technical proposal'));
  findButton(open).props.onClick({stopPropagation() {}});
  assert.equal(expanded, null);
  assert(!renderToStaticMarkup(renderPanel()).includes('Technical proposal'));
} finally { (React as any).useState = originalState; }
console.log('PASS bilingual workload entries, direct milestone links, empty/unavailable details, expandable controls');
