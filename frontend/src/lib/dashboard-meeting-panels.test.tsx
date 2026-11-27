import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as language from '../components/i18n/language-provider';
import {TaskPanels, taskDeadlineDays} from '../components/dashboard/task-panels';
import {setActiveLanguage,translate} from '../i18n';
const original=language.useLanguage, state=React.useState;
(language as any).useLanguage=()=>({t:translate,formatDate:(value:string)=>'TIME '+value});
let view='priority', expanded=false, hook=0;
(React as any).useState=()=>[hook++===0?view:expanded,()=>{}];
const common={id:'task',name:'Task',projectId:'p',projectName:'Project',status:'PENDING',dueDate:'2030-01-02T10:00:00Z',startDate:null,href:'/approvals'};
const render=(tasks:any[])=>{hook=0;return renderToStaticMarkup(React.createElement(TaskPanels,{loading:false,tasks}));};
try{
 for(const locale of ['en','id'] as const){
 setActiveLanguage(locale);
 const meetings=[{...common,id:'r',name:'Review meeting',kind:'MEETING_REVIEW',placement:'TASK_LIST'},{...common,id:'m',name:'Attend meeting',kind:'MEETING',placement:'PRIORITY',status:'APPROVED'}];
 view='priority';expanded=false;
 const priority=render(meetings);
 assert(!priority.includes('Review meeting'));assert(priority.includes('Attend meeting'));
 view='all';const all=render(meetings);
 assert(all.includes('Review meeting')&&all.includes('Attend meeting'));assert(all.includes('TIME 2030-01-02T10:00:00Z'));
 assert.equal((all.match(/<section /g)||[]).length,1);
 assert(!all.includes('overflow-y-auto'));assert(!all.includes('overscroll-contain'));
 const tasks=Array.from({length:9},(_,i)=>({...common,id:String(i),name:'Task '+i}));
 const preview=render(tasks);assert.equal((preview.match(/<li>/g)||[]).length,4);
 assert(preview.includes(translate('taskPreview.all',{count:9})));assert(preview.includes('aria-expanded="false"'));
 expanded=true;assert.equal((render(tasks).match(/<li>/g)||[]).length,9);expanded=false;
 const decision=render([...tasks,{...common,id:'decision',name:'Decision',dueDate:null,action:'PRA_TENDER_DECISION',href:'/projects/p#project-phase-panel'}]);
 assert(decision.includes(translate('salesPhaseTask.title')));assert(decision.includes('#project-phase-panel'));
 const sales=render([{...common,id:'sales-stage',name:'Tender Process',salesTask:true,href:'/projects/p#project-milestone-sales-stage'}]);
 assert(sales.includes(translate('salesStage.task')));assert(sales.includes(translate('common.open')));assert(sales.includes('#project-milestone-sales-stage'));
 const rejectedPlan=render([{...common,id:'plan-p',name:'Revise Project Plan',status:'REJECTED',action:'PLAN_REVISION',dueDate:null,href:'/projects/p'}]);
 assert(rejectedPlan.includes(translate('taskHub.revisePlan')));assert(rejectedPlan.includes(translate('approvalStatus.REJECTED')));
 const now=new Date('2030-01-02T18:00:00Z'); // Jan 3 in Jakarta
 assert.equal(taskDeadlineDays({...common,dueDate:'2030-01-02'},now),-1);
 assert.equal(taskDeadlineDays({...common,dueDate:'2030-01-03'},now),0);
 assert.equal(taskDeadlineDays({...common,dueDate:'2030-01-04'},now),1);
 assert.equal(taskDeadlineDays({...common,kind:'MEETING',dueDate:'2030-01-02T18:00:00Z'},now),0);
 assert.equal(taskDeadlineDays({...common,dueDate:null},now),null);
 }
 console.log('PASS unified task views, meeting placement, preview/expansion, links and Jakarta deadline boundaries');
}finally{(language as any).useLanguage=original;(React as any).useState=state;setActiveLanguage('en');}
