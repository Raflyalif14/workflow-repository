import assert from 'node:assert/strict';
import Module from 'node:module';
import React from 'react';
import {Button} from '../components/ui/button';
import {setActiveLanguage,translate} from '../i18n';
const original=(Module as any)._load;let writes:any[]=[];
(Module as any)._load=function(name:string,...args:any[]){
 if(name.endsWith('/auth-provider'))return {useAuth:()=>({user:{id:'head',role:'HEAD_SA'}})};
 if(name.endsWith('/language-provider'))return {useLanguage:()=>({t:translate,formatDate:(v:string)=>v})};
 if(name.endsWith('/use-calendar'))return {useMeetingMutation:()=>({isPending:false,isError:false,reset(){},mutateAsync:async(v:any)=>{writes.push(v);}})};
 return original.call(this,name,...args);
};
const hooks={state:React.useState,ref:React.useRef};let slots:any[]=[],cursor=0;
(React as any).useState=(initial:any)=>{const index=cursor++;if(!(index in slots))slots[index]=initial;return [slots[index],(v:any)=>{slots[index]=typeof v==='function'?v(slots[index]):v;}];};
(React as any).useRef=(initial:any)=>slots[cursor++]??={current:initial};
const nodes=(node:any):any[]=>!node||typeof node!=='object'?[]:[node,...React.Children.toArray(node.props?.children).flatMap(nodes)];
async function main(){try{
 const {MeetingActions}=require('../components/projects/project-meetings');
 for(const locale of ['en','id'] as const){setActiveLanguage(locale);slots=[];writes=[];
 const meeting:any={id:'meeting',projectId:'p',title:'Review',projectName:'Project',startsAt:'2030-01-02T10:00:00Z',endsAt:null,status:'PENDING',revision:1};
 const render=()=>{cursor=0;return nodes(MeetingActions({meeting}));};
 const button=(key:Parameters<typeof translate>[0])=>render().find(n=>n.type===Button&&React.Children.toArray(n.props.children).includes(translate(key)));
 button('meetings.approve').props.onClick();
 assert(button('meetingReview.approve'));assert(!render().some(n=>n.props.children===translate('meetings.reviewNote')));
 let input=render().find(n=>n.type==='textarea');assert.equal(input.props.required,false);
 assert(render().some(n=>React.Children.toArray(n.props.children).includes(translate('meetingReview.optionalNote'))));
 const choices=render().find(n=>n.props.role==='group');const reject=nodes(choices).find(n=>n.type===Button&&React.Children.toArray(n.props.children).includes(translate('meetings.reject')));reject.props.onClick();
 input=render().find(n=>n.type==='textarea');assert.equal(input.props.required,true);assert(button('meetingReview.reject').props.disabled);
 render().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await new Promise(r=>setImmediate(r));assert.equal(writes.length,0);
 input.props.onChange({target:{value:'Schedule needs revision'}});assert.equal(button('meetingReview.reject').props.disabled,false);
 render().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await new Promise(r=>setImmediate(r));assert.equal(writes[0].body.action,'REJECT');assert.equal(writes[0].body.note,'Schedule needs revision');
 meeting.proposedSchedule={startsAt:meeting.startsAt};button('meetings.approve').props.onClick();assert(button('meetingReview.approveReschedule'));
 render().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await new Promise(r=>setImmediate(r));assert.equal(writes[1].body.action,'APPROVE_RESCHEDULE');assert.equal(writes[1].body.note,'');
 }
 console.log('PASS meeting decision choices, optional approval note, required rejection reason, clear submit actions and reschedule payloads EN/ID');
}finally{(Module as any)._load=original;(React as any).useState=hooks.state;(React as any).useRef=hooks.ref;setActiveLanguage('en');}}
main().catch(e=>{console.error(e);process.exitCode=1;});
