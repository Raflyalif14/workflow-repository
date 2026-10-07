import assert from 'node:assert/strict';
import React, { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { createProjectCreateRequest,projectCreateErrorKey } from './project-create-request';
import { apiClient,ApiError } from './api-client';
import { setAuthTokens,getAuthSession,AUTH_SESSION_KEY } from './auth';
import { projectKeys,dashboardKeys } from './query-keys';
import { en } from '../i18n/en';import { id } from '../i18n/id';
import { setActiveLanguage,translate,DEFAULT_LANGUAGE } from '../i18n';
import * as auth from '../components/auth/auth-provider';
import * as language from '../components/i18n/language-provider';
import { useCreateProject } from '../hooks/use-projects';
import { BusinessConfirmation } from '../components/projects/business-confirmation';
import { Button } from '../components/ui/button';

const storage=new Map<string,string>(),events=new EventTarget();
const previousWindow=(globalThis as any).window;
(globalThis as any).window={localStorage:{getItem:(k:string)=>storage.get(k)||null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)},
  addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events)};
const response=(status:number,data?:unknown,code?:string)=>new Response(JSON.stringify({success:status<300,data,message:'fixture',errors:code?{code}:null}),{status});
const inputs={name:' Project ',customer:' Customer ',scenario_id:'scenario',estimated_revenue:100,selectedDocumentKeys:['assessment'],
  mom:new File(['mom'],'mom.pdf',{type:'application/pdf'}),photos:[new File(['photo'],'photo.jpg',{type:'image/jpeg'})],documents:[new File(['draft'],'file.pdf')]};
const tick=()=>new Promise<void>(r=>setImmediate(r));
type Element=React.ReactElement<any>;
const elements=(node:ReactNode):Element[]=>Array.isArray(node)?node.flatMap(elements):isValidElement(node)?[node as Element,...elements((node as Element).props.children)]:[];
async function run(){
  assert.equal(DEFAULT_LANGUAGE,'en');assert.deepEqual(Object.keys(en.createReceipt).sort(),Object.keys(id.createReceipt).sort());
  for(const key of Object.keys(en.createReceipt) as Array<keyof typeof en.createReceipt>)assert.deepEqual(en.createReceipt[key].match(/\{\w+\}/g)||[],id.createReceipt[key].match(/\{\w+\}/g)||[]);
  const request=createProjectCreateRequest();const attempts:Array<{body:FormData;id:string}>=[];
  let finish!:()=>void;
  const send=async(body:FormData,requestId:string)=>{attempts.push({body,id:requestId});await new Promise<void>(resolve=>finish=resolve);return {id:'same-project'};};
  const first=request.run(inputs,send),concurrent=request.run(inputs,send);await tick();assert.equal(attempts.length,1);finish();assert.deepEqual(await Promise.all([first,concurrent]),[{id:'same-project'},{id:'same-project'}]);
  await assert.rejects(()=>request.run(inputs,async(body,id)=>{attempts.push({body,id});throw new Error('connection');}));
  const failed=attempts.at(-1)!;setActiveLanguage('id');
  await assert.rejects(()=>request.run({...inputs,name:'Changed'},async()=>{throw new Error('Must not send');}),e=>e instanceof ApiError&&e.code==='CREATE_PAYLOAD_CONFLICT');
  await assert.rejects(()=>request.run({...inputs,mom:new File(['mom'],'mom.pdf',{type:'application/pdf'})},async()=>({})),e=>e instanceof ApiError&&e.code==='CREATE_PAYLOAD_CONFLICT');
  const retried=await request.run(inputs,async(body,id)=>{assert.equal(id,failed.id);assert.equal(body,failed.body);assert.equal((body.get('mom') as File).name,'mom.pdf');assert.equal(await (body.get('documents') as File).text(),'draft');return {id:'same-project'};});assert.equal(retried.id,'same-project');
  assert.equal(projectCreateErrorKey(new ApiError('PRIVATE',503,'CREATE_STORAGE_UNCERTAIN')),'createReceipt.uncertain');
  assert.equal(projectCreateErrorKey(new ApiError('PRIVATE',409,'CREATE_IN_PROGRESS')),'createReceipt.processing');

  const originalFetch=globalThis.fetch,originalAuth=auth.useAuth;
  try{
    setAuthTokens({accessToken:'fixture-old',refreshToken:'fixture-refresh'});const sessionId=getAuthSession()!.id;
    const replay=createProjectCreateRequest();let refreshes=0;const http:Array<{id:string|null;body:BodyInit|null|undefined;method?:string}>=[];
    globalThis.fetch=async(url,options)=>{if(String(url).endsWith('/auth/refresh')){refreshes++;return response(200,{accessToken:'fixture-new',refreshToken:'fixture-new-refresh'});}
      http.push({id:new Headers(options?.headers).get('x-project-create-request-id'),body:options?.body,method:options?.method});
      return new Headers(options?.headers).get('Authorization')==='Bearer fixture-old'?response(401,undefined,'AUTH_TOKEN_INVALID'):response(201,{id:'same-project'});
    };
    await replay.run(inputs,(body,requestId)=>apiClient('/projects',{method:'POST',body,headers:{'x-project-create-request-id':requestId}}));
    assert.equal(refreshes,1);assert.equal(http.length,2);assert.equal(http[0].id,http[1].id);assert.equal(http[0].body,http[1].body);assert.equal(http[1].method,'POST');assert.equal(getAuthSession()?.id,sessionId);
    const client=new QueryClient({defaultOptions:{mutations:{retry:false,gcTime:0}}});const keys:unknown[]=[];
    client.invalidateQueries=async(filters)=>{keys.push(filters?.queryKey);};let mutation!:ReturnType<typeof useCreateProject>;
    (auth as any).useAuth=()=>({user:{id:'owner',role:'SALES'}});
    function Harness(){mutation=useCreateProject();return null;}
    renderToStaticMarkup(createElement(QueryClientProvider,{client},createElement(Harness)));
    globalThis.fetch=async()=>response(201,{id:'existing-project',name:'Current server response'});
    client.setQueryData(projectKeys.detail('existing-project'),{name:'Latest cached state'});
    const hookIds:string[]=[];
    globalThis.fetch=async(_url,options)=>{hookIds.push(new Headers(options?.headers).get('x-project-create-request-id')!);return response(201);};
    await assert.rejects(()=>mutation.mutateAsync(inputs),e=>e instanceof ApiError&&e.code==='CREATE_RETRYABLE');
    globalThis.fetch=async(_url,options)=>{hookIds.push(new Headers(options?.headers).get('x-project-create-request-id')!);return response(201,{id:'existing-project',name:'Current server response'});};
    await mutation.mutateAsync(inputs);assert.equal(hookIds[0],hookIds[1],'Missing success body retains creation identity');
    assert(keys.some(k=>JSON.stringify(k)===JSON.stringify(projectKeys.all())));assert(keys.some(k=>JSON.stringify(k)===JSON.stringify(dashboardKeys.overview())));
    assert.deepEqual(client.getQueryData(projectKeys.detail('existing-project')),{name:'Latest cached state'},'Success invalidates lists, never writes historical receipt response into detail cache');client.clear();
  }finally{globalThis.fetch=originalFetch;(auth as any).useAuth=originalAuth;}

  const original={state:React.useState,ref:React.useRef,effect:React.useEffect,language:language.useLanguage};
  let states:any[]=[],refs:any[]=[],si=0,ri=0,writes=0,open=true;
  (React as any).useState=(initial:any)=>{const i=si++;if(!(i in states))states[i]=initial;return [states[i],(value:any)=>states[i]=typeof value==='function'?value(states[i]):value];};
  (React as any).useRef=(value:any)=>refs[ri++]??={current:value};(React as any).useEffect=()=>{};(language as any).useLanguage=()=>({});
  const props={open:true,onOpenChange:(value:boolean)=>open=value,title:'Project',changes:['mom.pdf','photo.jpg'],action:'Retry',allowConflictRetry:true,errorKey:'createReceipt.processing' as const,
    onConfirm:async()=>{writes++;throw new ApiError('safe',409,'CREATE_IN_PROGRESS');}};
  const tree=()=>{si=0;ri=0;return BusinessConfirmation(props);};const button=(text:string)=>elements(tree()).find(e=>e.type===Button&&e.props.children===text)!;
  try{
    button(translate('common.cancel')).props.onClick();assert.equal(writes,0);assert.equal(open,false);
    open=true;button('Retry').props.onClick();await tick();assert.equal(open,true);assert.equal(button('Retry').props.disabled,false,'Busy creation can retry same operation; no overwrite CAS');
    setActiveLanguage('en');assert(elements(tree()).some(e=>e.props.role==='alert'&&e.props.children===translate('createReceipt.processing')));
    setActiveLanguage('id');assert(elements(tree()).some(e=>e.props.role==='alert'&&e.props.children===translate('createReceipt.processing')));
    assert.equal(props.changes[0],'mom.pdf','Locale/cancel retain operation file names');
  }finally{(React as any).useState=original.state;(React as any).useRef=original.ref;(React as any).useEffect=original.effect;(language as any).useLanguage=original.language;setActiveLanguage('en');}
  console.log('Create frontend: stable ID/FormData, single concurrent send, frozen payload/file identity, token replay, invalidation, no stale cache write, cancel, busy retry and EN/ID passed.');
}
run().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{storage.delete(AUTH_SESSION_KEY);(globalThis as any).window=previousWindow;});
