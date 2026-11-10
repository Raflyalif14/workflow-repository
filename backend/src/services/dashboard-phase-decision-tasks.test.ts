import assert from 'node:assert/strict';
import {buildDashboardOverviewFromRows,DashboardSourceRows,DashboardProjectRow} from './dashboard.service';
const phase={id:'pra',project_id:'p',scenario_id:'s',phase_key:'PRA_TENDER',status:'COMPLETED',sales_decision:null};
const project:DashboardProjectRow={id:'p',name:'Completed Pra-Tender',customer:'Client',scenario_id:'s',current_scenario_id:'s',active_phase_id:'pra',active_phase:phase,phases:[phase],sales_id:'sales',pic_id:'sa',status:'ACTIVE',is_postponed:false};
function tasks(p:DashboardProjectRow=project,actor={userId:'sales',role:'SALES'}){const rows:DashboardSourceRows={projects:[p],milestones:[],scenarios:[{id:'s',name:'Pra-Tender'}],activityLogs:[],users:[],deadlineApprovals:[],projectPlanApprovals:[],outputDocuments:[]};return buildDashboardOverviewFromRows(rows,actor).workTasks.filter(t=>t.id.startsWith('phase-decision-'));}
assert.equal(tasks().length,1);assert.equal(tasks()[0].dueDate,null);assert.equal(tasks()[0].href,'/projects/p#project-phase-panel');
assert.equal(tasks({...project,phases:[{...phase,status:'ACTIVE'}]}).length,0);
assert.equal(tasks({...project,phases:[{...phase,sales_decision:'CLOSE_PRA_TENDER'}]}).length,0);
assert.equal(tasks({...project,phases:[phase,{...phase,id:'tender',phase_key:'ON_SUBMISSION_TENDER'}]}).length,0);
assert.equal(tasks({...project,is_postponed:true}).length,0);assert.equal(tasks({...project,status:'COMPLETED'}).length,0);
assert.equal(tasks(project,{userId:'foreign',role:'SALES'}).length,0);assert.equal(tasks(project,{userId:'head',role:'HEAD_SA'}).length,0);
console.log('PASS Sales decision task after completed Pra-Tender only, role/owner scope, no fabricated deadline and removal after decision');
const tenderRows:DashboardSourceRows={projects:[project],milestones:[{id:'tender',project_id:'p',phase_id:'pra',pic_id:null,name:'Tender Process',status:'CREATED',start_date:'2000-01-01',due_date:'2000-01-02',workflow_stage:{default_role:'SALES',stage_key:'TENDER_PROCESS'}}],scenarios:[],activityLogs:[],users:[],deadlineApprovals:[],projectPlanApprovals:[],outputDocuments:[]};
const salesTask=buildDashboardOverviewFromRows(tenderRows,{userId:'sales',role:'SALES'}).workTasks.find(t=>t.id==='tender');
assert(salesTask?.salesTask,'Sales task remains visible without a milestone PIC');
assert(salesTask.tenderResultTask,'Sales sees a result task instead of a manual start');
assert.equal(salesTask.href,'/projects/p#project-milestone-tender');
assert(!buildDashboardOverviewFromRows(tenderRows,{userId:'other',role:'SALES'}).workTasks.some(t=>t.id==='tender'));
