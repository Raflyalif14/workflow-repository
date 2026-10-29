import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SalesPipelineSummary } from '../components/dashboard/sales-pipeline-summary';
import { setActiveLanguage, translate } from '../i18n';

const data = {preTender:{active:2,postponed:3,estimatedRevenue:15000000},submissionTender:{advancedFromPreTender:7,inProgress:4,waitingResult:1,postponed:2,estimatedRevenue:25000000},results:{won:5,lost:6,finalRevenue:20000000}};
for (const locale of ['en','id'] as const) {
  setActiveLanguage(locale);
  const render = (props: Partial<React.ComponentProps<typeof SalesPipelineSummary>> = {}) => renderToStaticMarkup(<SalesPipelineSummary data={data} loading={false} hasError={false} onRetry={()=>{}} {...props}/>);
  const html = render();
  for (const heading of ['sales-pra-heading','sales-tender-heading','sales-result-heading']) assert(html.includes(`id="${heading}"`));
  for (const term of ['Active','Postponed','On Progress Tender','Waiting Result','WON','LOST','Final Revenue','Estimated Revenue',translate('salesPipeline.transitionHelp')]) assert(html.includes(term),term);
  assert(html.includes('15.000.000') || html.includes('15,000,000'));
  assert(!render({data:null}).includes('<dl'), 'Missing data cannot become zero counts');
  assert(render({data:null}).includes(translate('common.retry')));
  assert(render({data:null,loading:true}).includes('role="status"'));
  assert(!render({hasError:true}).includes('<dl'), 'Failed sources cannot appear complete');
}
setActiveLanguage('en');
