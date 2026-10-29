import assert from 'node:assert/strict';
import { buildDashboardOverviewFromRows, type DashboardProjectRow, type DashboardSourceRows } from './dashboard.service';

const scenarios = [{id:'pra',name:'Pra-Tender'},{id:'tender',name:'On Submission Tender'}];
function project(id: string, status: string, phase: 'PRA_TENDER' | 'ON_SUBMISSION_TENDER', transitioned = false): DashboardProjectRow {
  const current = {id:`${id}-current`,project_id:id,scenario_id:phase === 'PRA_TENDER' ? 'pra' : 'tender',phase_key:phase};
  return {id,name:id,customer:null,status,is_postponed:false,sales_id:'mine',pic_id:'sa',scenario_id:transitioned?'pra':current.scenario_id,
    current_scenario_id:current.scenario_id,active_phase_id:current.id,active_phase:current,phase_migration_state:'READY',
    phases:[current,...(transitioned?[{id:`${id}-previous`,project_id:id,scenario_id:'pra',phase_key:'PRA_TENDER'}]:[])],estimated_revenue:'100',final_contract_value:'70'};
}
const active = project('pra-active','ACTIVE','PRA_TENDER');
const paused = {...project('pra-paused','ACTIVE','PRA_TENDER'),is_postponed:true};
const progressed = project('progressed','ACTIVE','ON_SUBMISSION_TENDER',true);
const won = project('won','WON','ON_SUBMISSION_TENDER',true);
const lost = project('lost','LOST','ON_SUBMISSION_TENDER',true);
const direct = project('direct','ACTIVE','ON_SUBMISSION_TENDER');
const projects = [active,paused,progressed,won,lost,direct,
  project('wait','WAITING_RESULT','ON_SUBMISSION_TENDER',true),project('tender-paused','POSTPONED','ON_SUBMISSION_TENDER',true),
  project('planning','DRAFT','PRA_TENDER'),project('finished-pra','WON','PRA_TENDER'),
  {...project('other','WON','ON_SUBMISSION_TENDER',true),sales_id:'other'},
];
const rows = (list: DashboardProjectRow[]): DashboardSourceRows => ({projects:list,scenarios,milestones:[],deadlineApprovals:[],projectPlanApprovals:[],activityLogs:[],users:[]});
const summary = (list = projects) => buildDashboardOverviewFromRows(rows(list),{userId:'mine',role:'SALES'}).salesPipeline;
assert.deepEqual(summary(),{
  preTender:{active:1,postponed:1,estimatedRevenue:200},
  submissionTender:{advancedFromPreTender:5,inProgress:2,waitingResult:1,postponed:1,estimatedRevenue:400},
  results:{won:1,lost:1,finalRevenue:70},
});
assert.deepEqual(summary([...projects,progressed,won]),summary(),'One project is counted once, including repeated history rows');
assert.equal(summary([direct])!.submissionTender.advancedFromPreTender,0,'Direct tender entry is not a phase transition');
assert.equal(summary([{...won,phases:won.phases!.map(p=>({...p,project_id:'foreign'}))}])!.submissionTender.advancedFromPreTender,0,'Foreign phase histories cannot count');
assert.equal(summary([{...progressed,active_phase:undefined}]),null,'Unknown current phase is not presented as valid zero');
assert.equal(summary([{...progressed,phases:undefined}]),null,'Missing history must not pretend no projects transitioned');
assert.equal(summary([{...active,estimated_revenue:'invalid'}])!.preTender.estimatedRevenue,0);
assert.equal(buildDashboardOverviewFromRows(rows(projects),{userId:'head',role:'HEAD_SA'}).salesPipeline,null,'Only Sales receives the pipeline');
const headPipeline = buildDashboardOverviewFromRows(rows(projects),{userId:'head',role:'HEAD_SA'}).projectPipeline!;
assert.equal(headPipeline.submissionTender.advancedFromPreTender,6,'Head SA counts transitions across Sales owners');
assert.deepEqual(headPipeline.results,{won:2,lost:1,finalRevenue:140});
for (const role of ['SALES','SA','SUPER_ADMIN']) assert.equal(buildDashboardOverviewFromRows(rows(projects),{userId:'mine',role}).projectPipeline,null);
assert.deepEqual(summary([]),{preTender:{active:0,postponed:0,estimatedRevenue:0},submissionTender:{advancedFromPreTender:0,inProgress:0,waitingResult:0,postponed:0,estimatedRevenue:0},results:{won:0,lost:0,finalRevenue:0}});
console.log('Sales pipeline: current phase, genuine transitions, direct entry, unique projects, revenue boundaries and actor scoping passed.');
