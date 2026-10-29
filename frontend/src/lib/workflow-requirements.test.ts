import assert from 'node:assert/strict';
import { getPriorityTasks } from './dashboard-tasks';
import { compareMilestoneSchedule, getScheduledWorkStage } from './milestone-order';
import { projectDisplayStatus } from './project-display-status';
import { getMandatoryDocumentKeys } from '@/constants/scenarios';
import { setActiveLanguage,translate } from '@/i18n';
const task=(id:string,dueDate:string|null,status='IN_PROGRESS')=>({id,name:id,projectId:id,projectName:id,status,dueDate,startDate:null});
const ties=Array.from({length:12},(_,i)=>task(String(i),'2026-10-01'));
assert.equal(getPriorityTasks([...ties,task('future','2026-11-01'),task('completed','2026-09-01','COMPLETED'),task('undated',null)]).length,12,'Every tie, including overdue, remains visible');
assert.deepEqual(getPriorityTasks([task('none',null)]),[]);
assert(compareMilestoneSchedule({start_date:'2026-10-01',duration_working_days:2,step_order:9},{start_date:'2026-10-01',duration_working_days:5,step_order:1})<0);
const workStages = [
  {id:'active-later',status:'IN_PROGRESS',start_date:'2026-10-03',duration_working_days:1},
  {id:'created-long',status:'CREATED',start_date:'2026-10-01',duration_working_days:5},
  {id:'created-short',status:'CREATED',start_date:'2026-10-01',duration_working_days:2},
  {id:'finished',status:'COMPLETED',start_date:'2026-09-01',duration_working_days:1},
];
assert.equal(getScheduledWorkStage(workStages)?.id,'created-short');
assert.equal(getScheduledWorkStage(workStages.map(m=>({...m,status:'COMPLETED'}))),null);
assert.deepEqual(getMandatoryDocumentKeys('ON_SUBMISSION_TENDER'),['proposal_teknis']);
for(const locale of ['en','id']as const){setActiveLanguage(locale);assert.equal(projectDisplayStatus({status:'ACTIVE',scenario:{name:'On Submission Tender'} as any}),'On Progress Tender');assert.notEqual(projectDisplayStatus({status:'ACTIVE',scenario:{name:'Pra-Tender'}as any}),'On Progress Tender');assert.notEqual(projectDisplayStatus({status:'WON',scenario:{name:'On Submission Tender'}as any}),'On Progress Tender');assert.equal(translate('copy.needsAttention'),'Task List');assert.equal(translate('dashboardCopy.headTitle'),'Priority Task');assert.equal(translate('nav.dashboard'),'Dashboard');}
setActiveLanguage('en');
