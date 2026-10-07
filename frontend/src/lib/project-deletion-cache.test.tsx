import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDeleteProject } from '../hooks/use-projects';
import { outputDocumentKeys } from '../hooks/use-output-documents';
import { approvalKeys, dashboardKeys, projectKeys } from './query-keys';
import { ApiError } from './api-client';

async function run() {
  const client=new QueryClient({defaultOptions:{mutations:{retry:false,gcTime:0}}});
  const id='fixture-deleted-project';let mutation!:ReturnType<typeof useDeleteProject>;
  function Harness(){mutation=useDeleteProject(id);return null;}
  renderToStaticMarkup(createElement(QueryClientProvider,{client},createElement(Harness)));
  const queries=[projectKeys.all(),projectKeys.detail(id),projectKeys.detailWithoutActivity(id),projectKeys.milestones(id),projectKeys.progress(id),
    ['project-document-sharing',id],['documents'],outputDocumentKeys.repository(),['global-search','fixture'],approvalKeys.overview(),approvalKeys.stats(),dashboardKeys.overview()];
  queries.forEach(key=>client.setQueryData(key,{fixture:true}));
  const previousFetch=globalThis.fetch;let requests=0;
  try {
    globalThis.fetch=async()=>{requests++;return new Response(JSON.stringify({success:false,message:'safe fixture failure'}),{status:503});};
    await assert.rejects(()=>mutation.mutateAsync('Fixture project'),e=>e instanceof ApiError && e.status===503);
    queries.forEach(key=>assert.equal(client.getQueryState(key)?.isInvalidated,false,'Failed delete must not claim success or remove cache'));
    globalThis.fetch=async(_url,options)=>{requests++;assert.equal(options?.method,'DELETE');assert.equal(options?.body,JSON.stringify({confirmation:'Fixture project'}));
      return new Response(JSON.stringify({success:true,data:{project_id:id,cleanup:{id:'cleanup',status:'PENDING',storage_object_count:2}}}),{status:200});};
    await mutation.mutateAsync('Fixture project');
    [['project-document-sharing',id],projectKeys.detail(id),projectKeys.detailWithoutActivity(id),projectKeys.milestones(id),projectKeys.progress(id)].forEach(key=>assert.equal(client.getQueryData(key),undefined));
    [projectKeys.all(),['documents'],outputDocumentKeys.repository(),['global-search','fixture'],approvalKeys.overview(),approvalKeys.stats(),dashboardKeys.overview()]
      .forEach(key=>assert.equal(client.getQueryState(key)?.isInvalidated,true,JSON.stringify(key)+' must refresh after committed deletion, including pending Storage cleanup'));
    assert.equal(requests,2,'A failed mutation must not automatically replay');
    console.log('Project deletion cache: failure preserves state; success refreshes official/output repository, search, approvals/stats and Dashboard; pending cleanup remains a committed deletion. Passed.');
  } finally {globalThis.fetch=previousFetch;client.clear();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
