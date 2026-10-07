import assert from 'node:assert/strict';
import React,{ createElement,isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import * as auth from '../components/auth/auth-provider';
import * as language from '../components/i18n/language-provider';
import * as hooks from '../hooks/use-document-access';
import * as documentHooks from '../hooks/use-documents';
import { useOutputRepository,outputDocumentKeys } from '../hooks/use-output-documents';
import { ProjectDocumentSharing,ProjectSharingForm } from '../components/projects/project-document-sharing';
import { DocumentCommentsDrawer } from '../components/documents/document-comments-drawer';
import { Button } from '../components/ui/button';
import { Dialog } from '../components/ui/dialog';
import { ApiError,SessionChangedError } from './api-client';
import { setAuthTokens } from './auth';
import { globalSearchResultHref } from './global-search';
import { en } from '../i18n/en';
import { id } from '../i18n/id';
import { translate,setActiveLanguage } from '../i18n';
const elements=(node:any):any[] => Array.isArray(node) ? node.flatMap(elements) : !isValidElement(node) ? [] : [node,...elements((node.props as any).children)];
const originalAuth=auth.useAuth,originalLanguage=language.useLanguage,originalFetch=globalThis.fetch,originalWindow=(globalThis as any).window;
const storage=new Map<string,string>();
(globalThis as any).window={ localStorage:{ getItem:(k:string) => storage.get(k) ?? null,setItem:(k:string,v:string) => storage.set(k,v),removeItem:(k:string) => storage.delete(k) } };
let user:any={ id:'manager',role:'HEAD_SA',isActive:true },loading=false;
(auth as any).useAuth=() => ({ user,isLoading:loading });(language as any).useLanguage=() => ({ locale:'en',t:translate });
setAuthTokens({ accessToken:'fixture' });
const project={ id:'p',name:'Untranslated project name' };
const initial={ mode:'RESTRICTED' as const,revision:1,updatedAt:null,updatedBy:null };
async function formChecks() {
  const originals={ state:React.useState,ref:React.useRef,effect:React.useEffect,read:hooks.useProjectDocumentSharing,save:hooks.useSaveProjectDocumentSharing };
  const states:any[]=[],refs:any[]=[],effects:Array<() => void>=[],writes:any[]=[];
  let si=0,ri=0,failed=false,stale=false,current:any=initial;
  (React as any).useState=(value:any) => { const i=si++;if(!(i in states)) states[i]=typeof value==='function'?value():value;
    return [states[i],(next:any) => { states[i]=typeof next==='function'?next(states[i]):next; }]; };
  (React as any).useRef=(value:any) => { const i=ri++;if(!(i in refs)) refs[i]={ current:value };return refs[i]; };
  (React as any).useEffect=(fn:() => void) => effects.push(fn);
  (hooks as any).useProjectDocumentSharing=() => ({ data:current,isLoading:false,isError:false,refetch:async () => ({ data:{ ...current,revision:3 },isError:false }) });
  (hooks as any).useSaveProjectDocumentSharing=() => ({ isPending:false,mutateAsync:async (input:any) => {
    writes.push(input);if(failed) throw new ApiError('Safe failure',503);if(stale) throw new ApiError('Safe conflict',409);
    current={ ...current,mode:input.mode,revision:input.expected_revision+1 };return { ...current,changed:true,replayed:false }; } });
  const render=() => { si=0;ri=0;const tree=ProjectSharingForm({ project });effects.splice(0).forEach(fn => fn());return elements(tree); };
  const button=(key:Parameters<typeof translate>[0]) => render().find(node => node.type===Button && node.props.children===translate(key))!;
  const dialog=() => render().find(node => node.type===Dialog)!;
  const settle=() => new Promise(resolve => setImmediate(resolve));
  try {
    render();assert.equal(button('projectSharing.review').props.disabled,true,'Same value is not a UI write');assert.equal(writes.length,0);
    button('projectSharing.share').props.onClick();button('projectSharing.review').props.onClick();assert.equal(dialog().props.open,true);
    button('projectSharing.confirmNo').props.onClick();assert.equal(dialog().props.open,false);assert.equal(writes.length,0,'Cancel does not mutate');
    button('projectSharing.review').props.onClick();setActiveLanguage('id');assert.equal(dialog().props.open,true);
    assert.equal(button('projectSharing.share').props['aria-pressed'],true,'Locale retains selection');
    failed=true;button('projectSharing.confirmYes').props.onClick();button('projectSharing.confirmYes').props.onClick();await settle();
    assert.equal(writes.length,1,'Busy ref prevents double submit');assert.equal(dialog().props.open,true);
    assert(render().some(node => node.props.role==='alert'));assert.equal(writes[0].mode,'SHARED_INTERNAL');
    button('projectSharing.confirmNo').props.onClick();button('projectSharing.doNotShare').props.onClick();
    assert.equal(button('projectSharing.review').props.disabled,false,'An uncertain failure can reconfirm the baseline value; it is not assumed to be a successful no-op');
    assert(render().some(node => node.props.role==='alert'),'Changing the choice cannot hide an unresolved save failure');
    button('projectSharing.share').props.onClick();button('projectSharing.review').props.onClick();
    failed=false;button('projectSharing.confirmYes').props.onClick();await settle();assert.equal(writes[0].request_id,writes[1].request_id);
    assert.equal(dialog().props.open,false);render();
    button('projectSharing.doNotShare').props.onClick();button('projectSharing.review').props.onClick();stale=true;
    button('projectSharing.confirmYes').props.onClick();await settle();assert.equal(dialog().props.open,true);assert(button('projectSharing.confirmYes').props.disabled);
    await button('projectSharing.reload').props.onClick();assert.equal(dialog().props.open,false);assert.equal(button('projectSharing.doNotShare').props['aria-pressed'],true,'Reload retains desired choice and asks for review again');
    stale=false;button('projectSharing.review').props.onClick();button('projectSharing.confirmYes').props.onClick();await settle();
    assert.equal(writes.at(-1).expected_revision,3);assert.notEqual(writes.at(-1).request_id,writes.at(-2).request_id);
    const key=(ProjectDocumentSharing({ project }) as any).key;setActiveLanguage('en');assert.equal((ProjectDocumentSharing({ project }) as any).key,key);
    user={ ...user,id:'manager-b' };setAuthTokens({ accessToken:'fixture-b' });assert.notEqual((ProjectDocumentSharing({ project }) as any).key,key);
    for(const role of ['SALES','SA']) { user={ ...user,role };assert.equal(ProjectDocumentSharing({ project }),null); }
  } finally {
    (React as any).useState=originals.state;(React as any).useRef=originals.ref;(React as any).useEffect=originals.effect;
    (hooks as any).useProjectDocumentSharing=originals.read;(hooks as any).useSaveProjectDocumentSharing=originals.save;setActiveLanguage('en');
  }
}
async function queryChecks() {
  const client=new QueryClient({ defaultOptions:{ queries:{ retry:false },mutations:{ retry:false } } });
  const invalidated:any[]=[],invalidate=client.invalidateQueries.bind(client);
  client.invalidateQueries=((options:any) => { invalidated.push(options.queryKey);return invalidate(options); }) as any;
  let settings!:ReturnType<typeof hooks.useProjectDocumentSharing>,save!:ReturnType<typeof hooks.useSaveProjectDocumentSharing>,repository!:ReturnType<typeof documentHooks.useDocuments>,output!:ReturnType<typeof useOutputRepository>;
  function Harness() { settings=hooks.useProjectDocumentSharing('p');save=hooks.useSaveProjectDocumentSharing('p');repository=documentHooks.useDocuments();output=useOutputRepository();return null; }
  const render=() => renderToStaticMarkup(createElement(QueryClientProvider,{ client },createElement(Harness)));
  let requests=0;const response=(data:any) => new Response(JSON.stringify({ success:true,data }),{ status:200 });
  globalThis.fetch=(async () => { requests++;return response(initial); }) as typeof fetch;
  try {
    for(const role of ['SALES','SA','HEAD_SA','SUPER_ADMIN']) {
      user={ id:'manager',role,isActive:true };render();const eligible=['HEAD_SA','SUPER_ADMIN'].includes(role);assert.equal(settings.isEnabled,eligible);
      if(!eligible) { const before=requests;await assert.rejects(() => settings.refetch({ throwOnError:true }),SessionChangedError);
        await assert.rejects(() => save.mutateAsync({ mode:'RESTRICTED',expected_revision:1,request_id:'r' }),SessionChangedError);assert.equal(requests,before); }
    }
    for(const fixture of [null,{ id:'x',role:'HEAD_SA',isActive:false },{ id:'x',role:'HEAD_SA',isActive:true,mustChangePassword:true }]) {
      user=fixture;render();assert.equal(settings.isEnabled,false);assert.equal(repository.isEnabled,false);assert.equal(output.isEnabled,false);
    }
    loading=true;user={ id:'manager',role:'HEAD_SA',isActive:true };render();assert.equal(settings.isEnabled,false);loading=false;render();
    assert.deepEqual((await settings.refetch({ throwOnError:true })).data,initial);render();
    assert(client.getQueryCache().getAll().filter(query => ['documents','global-search','output-documents','project-document-sharing'].includes(String(query.queryKey[0]))).every(query => query.queryKey.includes('project-sharing-v1')),'Cutover query keys cannot consume cached legacy-grant results');
    await save.mutateAsync({ mode:'SHARED_INTERNAL',expected_revision:1,request_id:'same' });
    for(const key of [['project-document-sharing','p'],['documents'],['document'],['global-search'],outputDocumentKeys.repository()]) assert(invalidated.some(item => JSON.stringify(item)===JSON.stringify(key)));
    user={ ...user,id:'manager-c' };setAuthTokens({ accessToken:'fixture-c' });render();assert.equal(settings.data,undefined);assert.equal(repository.data,undefined);assert.equal(output.data,undefined);
    globalThis.fetch=(async () => response({ wrongShape:true })) as typeof fetch;
    await assert.rejects(() => repository.refetch({ throwOnError:true }),/repository response/);await assert.rejects(() => output.refetch({ throwOnError:true }),/repository response/);
    globalThis.fetch=(async () => new Response(JSON.stringify({ success:false,message:'Safe failure' }),{ status:503 })) as typeof fetch;
    await assert.rejects(() => repository.refetch({ throwOnError:true }),ApiError);await assert.rejects(() => output.refetch({ throwOnError:true }),ApiError);
    const count=invalidated.length;let release!:(response:Response) => void;
    globalThis.fetch=(() => new Promise<Response>(resolve => { release=resolve; })) as typeof fetch;
    const pending=save.mutateAsync({ mode:'RESTRICTED',expected_revision:1,request_id:'late' });const rejection=assert.rejects(pending,SessionChangedError);
    await new Promise(resolve => setImmediate(resolve));user={ ...user,id:'manager-d' };setAuthTokens({ accessToken:'fixture-d' });render();
    release(response(initial));await rejection;assert.equal(invalidated.length,count,'Late old-session response does not refresh new account cache');
  } finally {client.clear();}
}
function deniedDetailCheck() {
  const originals={ state:React.useState,effect:React.useEffect,document:documentHooks.useDocument,download:documentHooks.useDocumentDownloadUrl,comment:documentHooks.useAddComment };
  const privateDoc:any={ id:'d',title:'PRIVATE_CACHE',canReadProject:true,project:{ name:'PRIVATE_PROJECT' },versions:[{ fileName:'PRIVATE_FILE' }] };
  (React as any).useState=(value:any) => [value,() => {}];(React as any).useEffect=() => {};
  (documentHooks as any).useDocument=() => ({ data:privateDoc,isError:true,refetch() {} });
  (documentHooks as any).useDocumentDownloadUrl=() => ({});(documentHooks as any).useAddComment=() => ({});
  try {
    const tree=DocumentCommentsDrawer({ open:true,onOpenChange() {},document:privateDoc,canUploadVersion:false,onUploadVersion() {} });
    assert(!JSON.stringify(tree).includes('PRIVATE_'),'Refetch denial hides retained detail cache');
    assert(elements(tree).some(node => node.props.role==='alert'));
  } finally { (React as any).useState=originals.state;(React as any).useEffect=originals.effect;
    (documentHooks as any).useDocument=originals.document;(documentHooks as any).useDocumentDownloadUrl=originals.download;(documentHooks as any).useAddComment=originals.comment; }
}

void (async () => {
  try {
    assert.deepEqual(Object.keys(en.projectSharing).sort(),Object.keys(id.projectSharing).sort());
    for(const key of Object.keys(en.projectSharing) as Array<keyof typeof en.projectSharing>) {
      const placeholders=(s:string) => [...s.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();assert.deepEqual(placeholders(en.projectSharing[key]),placeholders(id.projectSharing[key]));
    }
    assert.equal(globalSearchResultHref({ type:'DOCUMENT',projectId:'private',canReadProject:false,repositorySourceId:'d' }),'/documents?source=OFFICIAL&id=d');
    assert.equal(globalSearchResultHref({ type:'OUTPUT_DOCUMENT',projectId:'p',milestoneId:'m',canReadProject:true }),'/projects/p#milestone-outputs-m');
    await formChecks();await queryChecks();deniedDetailCheck();console.log('Project sharing: manager eligibility, cancel/confirmation, retry/conflict, locale/session isolation, cache refresh and private repository detail passed');
  } finally { (auth as any).useAuth=originalAuth;(language as any).useLanguage=originalLanguage;globalThis.fetch=originalFetch;(globalThis as any).window=originalWindow; }
})().catch(error => { console.error(error);process.exitCode=1; });
