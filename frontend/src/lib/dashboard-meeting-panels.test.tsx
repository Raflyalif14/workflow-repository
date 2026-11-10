import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as language from '../components/i18n/language-provider';
import {TaskPanels} from '../components/dashboard/task-panels';
import {setActiveLanguage,translate} from '../i18n';
const original=language.useLanguage;
(language as any).useLanguage=()=>({t:translate,formatDate:(value:string)=>'TIME '+value});
try{
 for(const locale of ['en','id'] as const){
 setActiveLanguage(locale);
 const common={projectId:'p',projectName:'Project',status:'PENDING',dueDate:'2030-01-02T10:00:00Z',startDate:null,href:'/approvals'};
 const html=renderToStaticMarkup(React.createElement(TaskPanels,{loading:false,tasks:[{...common,id:'r',name:'Review meeting',kind:'MEETING_REVIEW',placement:'TASK_LIST'},{...common,id:'m',name:'Attend meeting',kind:'MEETING',placement:'PRIORITY',status:'APPROVED'}]}));
 const sections=html.split('</section>');assert(!sections[0].includes('Review meeting'));assert(sections[0].includes('Attend meeting'));assert(sections[1].includes('Review meeting'));assert(!sections[1].includes('Attend meeting'));assert(html.includes('TIME 2030-01-02T10:00:00Z'));assert(!html.includes('overflow-y-auto'));assert(!html.includes('overscroll-contain'));
 const many=renderToStaticMarkup(React.createElement(TaskPanels,{loading:false,tasks:Array.from({length:9},(_,i)=>({...common,id:String(i),name:'Task '+i}))}));
 const decision=renderToStaticMarkup(React.createElement(TaskPanels,{loading:false,tasks:[...Array.from({length:8},(_,i)=>({...common,id:'dated'+i,name:'Dated task'})),{...common,id:'decision',name:'Decision',dueDate:null,action:'PRA_TENDER_DECISION',href:'/projects/p#project-phase-panel'}]}));
 assert(decision.includes(translate('salesPhaseTask.title')));assert(decision.includes(translate('salesPhaseTask.open')));
 const sales=renderToStaticMarkup(React.createElement(TaskPanels,{loading:false,tasks:[{...common,id:'sales-stage',name:'Tender Process',salesTask:true,href:'/projects/p#project-milestone-sales-stage'}]}));
 assert(sales.includes(translate('salesStage.task')));assert(sales.includes(translate('salesStage.view')));assert(sales.includes('#project-milestone-sales-stage'));
 const list=many.split('</section>')[1];assert.equal((list.match(/<li>/g)||[]).length,4);assert(list.includes(translate('taskPreview.all',{count:9})));assert(!list.includes('<nav'));assert(list.includes('aria-expanded="false"'));
 }
 console.log('PASS meeting panel placement, translated labels, date/time and bounded lists');
}finally{(language as any).useLanguage=original;setActiveLanguage('en');}
