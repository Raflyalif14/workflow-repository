import assert from 'node:assert/strict';
import React from 'react';
import * as api from './api-client';
import * as device from './face-login-device';
import * as passive from './face-passive-test';
import * as camera from '@/hooks/use-camera-preview';
import * as auth from '@/components/auth/auth-provider';
import * as language from '@/components/i18n/language-provider';
import { FacePassiveTest } from '@/components/settings/face-passive-test';
import { clearStoredAuth } from './auth';
import { en } from '@/i18n/en';
import { id } from '@/i18n/id';
const find=(node:any,predicate:(v:any)=>boolean):any=>{
  if(!node||typeof node!=='object')return null;if(predicate(node))return node;
  for(const child of React.Children.toArray(node.props?.children)){const value=find(child,predicate);if(value)return value;}return null;
};
export async function testPassiveUi() {
  const old={window:globalThis.window,api:api.apiClient,get:device.getFaceDevice,burst:passive.captureFaceBurst,camera:camera.useCameraPreview,auth:auth.useAuth,language:language.useLanguage};
  const slots:any[]=[], cleanups:any[]=[];
  const owner=crypto.randomUUID(),pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
  const stored={id:crypto.randomUUID(),owner,registered:true,privateKey:pair.privateKey,publicKey:await crypto.subtle.exportKey('jwk',pair.publicKey)};
  let starts=0, scans=0, submits=0, condition:passive.FaceSample='live', delayStart:((v:any)=>void)|null=null, startSignal:AbortSignal|null=null;
  const cameraState={videoRef:{current:{}},status:'on',error:null,start:async()=>{starts++;},stop(){}};
  (globalThis as any).window=Object.assign(new EventTarget(),{localStorage:{getItem:()=>null,removeItem(){}}});
  (camera as any).useCameraPreview=()=>cameraState;
  (auth as any).useAuth=()=>({user:{id:owner,isActive:true},completeFaceLogin(){throw Error('A passive test must never sign in');}});
  (language as any).useLanguage=()=>({t:(key:string)=>key});
  (device as any).getFaceDevice=async()=>stored;
  (passive as any).captureFaceBurst=async()=>{scans++;return[0,1,2].map(i=>new Blob([`scan-${scans}-${i}`]));};
  const challenge=()=>({id:crypto.randomUUID(),nonce:'fixture',deviceId:stored.id,action:'passive-test',sample:condition,direction:'left',expiresAt:new Date(Date.now()+90000).toISOString()});
  (api as any).apiClient=async(path:string,options:any)=>{
    if(path.endsWith('/start')){condition=JSON.parse(options.body).sample;startSignal=options.signal;if(delayStart)return new Promise(resolve=>{delayStart=resolve;});return challenge();}
    assert.equal(path,'/face-login/passive-test/finish');submits++;
    const proof=JSON.parse(options.body.get('proof'));assert.equal(proof.signature.length,86);assert.equal(options.body.getAll('frames').length,3);
    const accepted=condition!=='video';
    return{version:'webcam-passive-evaluation-v1',evaluationOnly:true,sample:condition,testedAt:new Date().toISOString(),accepted,
      checks:{pad:accepted,identity:true,position:true},frames:Array.from({length:3},()=>({classes:[[.01,.98,.01],[.01,.98,.01]],identity:.8,consistency:.9,yaw:0}))};
  };
  function render(){
    let cursor=0;const effects:any[]=[],hooks={useState:React.useState,useRef:React.useRef,useEffect:React.useEffect};
    (React as any).useState=(initial:any)=>{const slot=slots[cursor++]??={value:initial};return[slot.value,(v:any)=>{slot.value=typeof v==='function'?v(slot.value):v;}];};
    (React as any).useRef=(initial:any)=>slots[cursor++]??={current:initial};
    (React as any).useEffect=(fn:any,deps?:any[])=>{const i=cursor++;if(!deps||!slots[i]?.deps||deps.some((v:any,j:number)=>!Object.is(v,slots[i].deps[j]))){slots[i]={deps};effects.push(()=>{cleanups[i]?.();cleanups[i]=fn();});}};
    let tree:any;try{tree=FacePassiveTest();}finally{Object.assign(React,hooks);}effects.forEach(fn=>fn());return tree;
  }
  const flush=async()=>{for(let i=0;i<5;i++){await new Promise(r=>setImmediate(r));render();}};
  const until=async(test:()=>boolean)=>{for(let i=0;i<100&&!test();i++)await flush();assert(test());};
  const click=(key:string)=>{const button=find(render(),n=>n.props?.children===key&&typeof n.props.onClick==='function');assert(button);button.props.onClick();};
  try{
    const outcome=(sample:passive.FaceSample,accepted:boolean,identity=true,position=true)=>passive.passiveOutcome({sample,accepted,checks:{pad:accepted,identity,position}});
    assert.equal(outcome('live',true),'liveAccepted');
    assert.equal(outcome('live',false),'liveNotAccepted');
    assert.equal(outcome('photo',false),'photoBlocked');
    assert.equal(outcome('video',false),'videoBlocked');
    assert.equal(outcome('photo',true),'attackAccepted');
    assert.equal(outcome('video',false,false),'inconclusiveTitle');
    assert.equal(outcome('video',false,true,false),'inconclusiveTitle');
    assert.deepEqual(Object.keys(en.facePassive),Object.keys(id.facePassive));render();await flush();assert.equal(starts,0);assert.equal(scans,0);
    for(const sample of ['live','photo','video'] as const){const before=submits;click(`facePassive.${sample}`);await until(()=>submits===before+1);await flush();}
    assert.equal(starts,3);assert.equal(scans,3);
    assert(find(render(),n=>n.props?.role==='alert'&&n.props.children==='facePassive.attackPassed'),'A later rejection cannot hide an earlier accepted photo');
    delayStart=()=>{};click('facePassive.live');await until(()=>!!startSignal);await flush();
    const before=starts;clearStoredAuth();assert(startSignal!.aborted);(delayStart as any)(challenge());await flush();assert.equal(starts,before);assert.equal(submits,3);
    assert(!find(render(),n=>n.props?.['aria-label']==='facePassive.results'),'Logout clears prior face test results');
    console.log('Passive UI PASS: explicit scan, existing registration, signed 3-frame test only, all attempts kept, accepted-photo warning survives retests, logout invalidates pending camera and results, EN/ID. Camera/provider/storage mocked.');
  }finally{
    cleanups.forEach(fn=>fn?.());(globalThis as any).window=old.window;
    (api as any).apiClient=old.api;(device as any).getFaceDevice=old.get;(passive as any).captureFaceBurst=old.burst;
    (camera as any).useCameraPreview=old.camera;(auth as any).useAuth=old.auth;(language as any).useLanguage=old.language;
  }
}
