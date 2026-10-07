import assert from 'node:assert/strict';
import React, { isValidElement } from 'react';
import * as auth from '../components/auth/auth-provider';
import * as language from '../components/i18n/language-provider';
import * as documents from '../hooks/use-documents';
import * as outputs from '../hooks/use-output-documents';
import DocumentsPage from '../app/documents/page';
import { Button } from '../components/ui/button';
import { translate, setActiveLanguage } from '../i18n';
import { setAuthTokens, clearStoredAuth } from './auth';

const nodes = (node: any): any[] => Array.isArray(node) ? node.flatMap(nodes) : !isValidElement(node) ? [] : [node, ...nodes((node.props as any).children)];
const originals = { state: React.useState, memo: React.useMemo, effect: React.useEffect, ref: React.useRef,
  auth: auth.useAuth, language: language.useLanguage, documents: documents.useDocuments, outputs: outputs.useOutputRepository,
  download: documents.useDocumentDownloadUrl, outputDownload: outputs.useOutputRepositoryDownload, window: (globalThis as any).window };
const storage = new Map<string,string>();
(globalThis as any).window = { localStorage: { getItem: (k:string) => storage.get(k) ?? null,
  setItem: (k:string,v:string) => storage.set(k,v), removeItem: (k:string) => storage.delete(k) } };
setAuthTokens({ accessToken: 'fixture' });
let user:any = { id:'reader',role:'SA',isActive:true }, locale:'en'|'id'='en';
const states:any[] = []; let stateIndex=0, requests=0;
let official:any = { data:[],isError:false,isFetching:false,refetch:() => { requests++; } };
let output:any = { ...official };
(React as any).useState = (initial:any) => { const i=stateIndex++;if(!(i in states)) states[i]=typeof initial==='function'?initial():initial;
  return [states[i], (value:any) => { states[i]=typeof value==='function'?value(states[i]):value; }]; };
(React as any).useMemo = (fn:any) => fn(); (React as any).useEffect = () => {}; (React as any).useRef = (value:any) => ({ current:value });
(auth as any).useAuth = () => ({ user,isLoading:false });
(language as any).useLanguage = () => ({ locale });
(documents as any).useDocuments = () => official; (outputs as any).useOutputRepository = () => output;
(documents as any).useDocumentDownloadUrl = () => ({ isPending:false }); (outputs as any).useOutputRepositoryDownload = () => ({});
const render = () => { stateIndex=0; const page=DocumentsPage() as any; return nodes(page.type(page.props)); };
const summary = (tree:any[]) => tree.find(node => node.type==='section' && node.props['aria-label']===translate('documentPage.summary'));
const counters = (tree:any[]) => nodes(summary(tree)).filter(node => node.type==='p' && typeof node.props.children==='number').map(node => node.props.children);
try {
  let tree=render(); assert.deepEqual(counters(tree),[0,0,0,0],'Successful empty result is valid zero');
  assert(tree.some(node => node.props.children===translate('documentPage.noAssignedResults')));
  official={ ...official,data:undefined }; tree=render(); assert.equal(counters(tree).length,0,'Pending data is not zero');
  official={ ...official,data:[],isError:true }; tree=render(); assert.equal(counters(tree).length,0,'Error is not zero');
  assert(tree.some(node => node.props.children===translate('ui.documentLoadFailed')));
  const retry=tree.find(node => node.type===Button && node.props.children===translate('common.retry'))!;
  retry.props.onClick(); assert.equal(requests,2);
  user=null; clearStoredAuth({ notify:false }); render(); retry.props.onClick(); assert.equal(requests,2,'A retained retry cannot fetch after the account becomes ineligible');
  user={ id:'reader',role:'SA',isActive:true }; setAuthTokens({ accessToken:'fixture-restored' }); official={ ...official,isError:false };
  tree=render(); const tabs=(items:any[]) => items.filter(node => node.props.role==='tab');
  assert.equal(tabs(tree).length,2); assert.equal(tabs(tree)[0].props['aria-selected'],true,'All is default');
  assert.equal(tabs(tree)[1].props.children,translate('documentPage.assignedProjects'));
  assert(!tree.some(node => node.props.id==='repository-access-group'),'Access dropdown is removed');
  tabs(tree)[1].props.onClick();
  tree=render(); assert(tree.some(node => node.props.children===translate('documentPage.noAssignedProjectResults')));
  assert.equal(tabs(tree)[1].props.tabIndex,0);assert.equal(tabs(tree)[0].props.tabIndex,-1);
  let focused='',prevented=0;
  const keyboard=(key:string) => ({ key,preventDefault:() => { prevented++; },currentTarget:{ parentElement:{
    querySelector:(selector:string) => ({ focus:() => { focused=selector; } }) } } });
  tabs(tree)[1].props.onKeyDown(keyboard('ArrowRight')); tree=render();
  assert.equal(tabs(tree)[0].props['aria-selected'],true);assert.equal(focused,'#repository-tab-ALL');
  tabs(tree)[0].props.onKeyDown(keyboard('ArrowLeft')); tree=render();
  assert.equal(tabs(tree)[1].props['aria-selected'],true,'Arrow keys wrap');
  tabs(tree)[1].props.onKeyDown(keyboard('Home'));tree=render();assert.equal(tabs(tree)[0].props['aria-selected'],true);
  tabs(tree)[0].props.onKeyDown(keyboard('End'));tree=render();assert.equal(tabs(tree)[1].props['aria-selected'],true);
  assert.equal(prevented,4);
  locale='id'; setActiveLanguage('id'); tree=render();
  assert.equal(tabs(tree)[1].props['aria-selected'],true,'Selected tab survives locale changes');
  assert.equal(tabs(tree)[1].props.children,translate('documentPage.assignedProjects'));
  assert.equal(tree.find(node => node.props.role==='tabpanel')!.props['aria-labelledby'],tabs(tree)[1].props.id);
  const item:any={ id:'d',projectId:'p',title:'User title',category:'MOM',status:'APPROVED',canReadProject:true,canManageAccess:true,
    accessMode:'RESTRICTED',isSharedWithMe:true,createdAt:'2026-01-01',updatedAt:'2026-01-01',versions:[] };
  official={ ...official,data:[item] }; tree=render();
  assert.deepEqual(counters(tree),[1,1,0,0],'Refresh keeps selected category and its whole-result counters');
  const row=tree.find(node => typeof node.type==='function' && node.props.document?.id==='d')!;
  assert(!nodes(row.type(row.props)).some(node => node.type===Button && node.props.children==='Manage access'),'No per-document controls remain');
  // Both modes and an individual grant stay visible in All, not in Assigned.
  const granted={ ...item,id:'granted',canReadProject:false },shared={ ...item,id:'shared',canReadProject:false,accessMode:'SHARED_INTERNAL' };
  official={ ...official,data:[item,granted,shared] };tree=render();assert.deepEqual(counters(tree),[1,1,0,0]);
  tabs(tree)[0].props.onClick();tree=render();assert.deepEqual(counters(tree),[3,3,0,0]);
  const rows=tree.filter(node => typeof node.type==='function' && node.props.document?.id);
  assert(rows.some(node => node.props.document.id==='granted'));
  assert(nodes(rows.find(node => node.props.document.id==='shared')!.type(rows.find(node => node.props.document.id==='shared')!.props))
    .some(node => node.props.children===translate('documentAccess.shared')));
  assert(nodes(rows.find(node => node.props.document.id==='granted')!.type(rows.find(node => node.props.document.id==='granted')!.props))
    .some(node => node.props.children===translate('documentAccess.restricted')));
  official={ ...official,data:Array.from({ length:25 },(_,i) => ({ ...item,id:`row-${i}` })) };tree=render();
  tree.find(node => node.type===Button && node.props.children===translate('documentPage.next'))!.props.onClick();tree=render();
  assert(tree.some(node => Array.isArray(node.props.children) && node.props.children.join('')===translate('documentPage.pageOf',{ page:2,total:2 })+' \u00b7 '+translate('documentPage.resultsCount',{ count:25 })));
  tabs(tree)[1].props.onClick();tree=render();
  assert.equal(tree.filter(node => typeof node.type==='function' && node.props.document?.id).length,20,'Tab change resets to first page');
  user={ ...user,role:'SALES' };tree=render();assert.equal(tabs(tree)[1].props.children,translate('documentPage.myProjects'));
  locale='en'; setActiveLanguage('en'); user={ ...user,role:'HEAD_SA' };official={ ...official,data:[item] };tree=render();
  assert.equal(tabs(tree).length,1);assert.equal(tabs(tree)[0].props['aria-selected'],true,'Managers have no misleading ownership tab');
  const managerRow=tree.find(node => typeof node.type==='function' && node.props.document?.id==='d')!;
  assert(!nodes(managerRow.type(managerRow.props)).some(node => node.type===Button && node.props.children==='Manage access'),'Managers configure sharing only in Project Detail');
  user={ ...user,role:'SUPER_ADMIN' };tree=render();assert.equal(tabs(tree).length,1);
  const oldKey=(DocumentsPage() as any).key;
  user={ ...user,id:'another-manager' };setAuthTokens({ accessToken:'fixture-new-session' });
  assert.notEqual((DocumentsPage() as any).key,oldKey,'Account/session changes reset private selections');
  console.log('Documents page: successful empty/error/loading, guarded retry, keyboard tabs, pagination reset, category retained on locale/refetch, shared/granted results, badges, manager controls and account reset passed.');
} finally {
  (React as any).useState=originals.state;(React as any).useMemo=originals.memo;(React as any).useEffect=originals.effect;(React as any).useRef=originals.ref;
  (auth as any).useAuth=originals.auth;(language as any).useLanguage=originals.language;
  (documents as any).useDocuments=originals.documents;(outputs as any).useOutputRepository=originals.outputs;
  (documents as any).useDocumentDownloadUrl=originals.download;(outputs as any).useOutputRepositoryDownload=originals.outputDownload;
  setActiveLanguage('en');(globalThis as any).window=originals.window;
}
