import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getMandatoryDocumentKeys } from '../constants/scenarios';
import { compareMilestoneSchedule } from '../utils/milestone-order';
import { validateOutcomeEvidenceFiles } from '../utils/outcome-evidence';
import { matchesRegisteredFace } from '../utils/face-account-match';
import { projectOutcomeSchema } from '../validators/project-management.validator';
import { buildDashboardOverviewFromRows } from './dashboard.service';

assert.deepEqual(getMandatoryDocumentKeys('ON_SUBMISSION_TENDER'),['proposal_teknis']);
const schedule=[{id:'later',start_date:'2026-11-04',duration_working_days:1},{id:'long',start_date:'2026-11-01',duration_working_days:5},{id:'short',start_date:'2026-11-01',duration_working_days:2},{id:'none'}];
assert.deepEqual(schedule.sort(compareMilestoneSchedule).map(m=>m.id),['short','long','later','none']);
const validId='90000000-0000-4000-8000-000000000001';
assert(!projectOutcomeSchema.safeParse({outcome:'WON',final_contract_value:10}).success);
assert(projectOutcomeSchema.safeParse({outcome:'WON',final_contract_value:10,evidence_document_ids:[validId]}).success);
assert(projectOutcomeSchema.safeParse({outcome:'LOST',loss_reason:'Customer decision',evidence_document_ids:[validId]}).success);
assert(!projectOutcomeSchema.safeParse({outcome:'LOST',loss_reason:'Reason',evidence_document_ids:[validId,validId]}).success);
for(const [name,bytes]of [['a.pdf',Buffer.from('%PDF-test')],['a.jpg',Buffer.from([255,216,255,0])],['a.jpeg',Buffer.from([255,216,255,0])],['a.png',Buffer.from([137,80,78,71,13,10,26,10])],['a.doc',Buffer.from([208,207,17,224,161,177,26,225])],['a.docx',Buffer.from([80,75,3,4])]] as const){const file={originalname:name,buffer:bytes,size:bytes.length,mimetype:'text/html'} as Express.Multer.File;validateOutcomeEvidenceFiles([file]);assert.notEqual(file.mimetype,'text/html');}
assert.throws(()=>validateOutcomeEvidenceFiles([]));
assert.throws(()=>validateOutcomeEvidenceFiles([{originalname:'fake.pdf',buffer:Buffer.from('<script>'),size:8} as Express.Multer.File]));
assert.throws(()=>validateOutcomeEvidenceFiles([{originalname:'evidence.zip',buffer:Buffer.from([80,75,3,4]),size:4} as Express.Multer.File]));
const a=Array(128).fill(0),b=Array(128).fill(0);a[0]=1;b[1]=1;
assert(matchesRegisteredFace(a,a));assert(!matchesRegisteredFace(a,b));assert.throws(()=>matchesRegisteredFace([1],a));
const overview=buildDashboardOverviewFromRows({projects:[{id:'visible',name:'A',customer:null,status:'ACTIVE',sales_id:'sales',pic_id:'sa',scenario_id:'s'},{id:'hidden',name:'B',customer:null,status:'ACTIVE',sales_id:'other',pic_id:'other',scenario_id:'s'}],
milestones:[{id:'a',project_id:'visible',name:'Early',status:'IN_PROGRESS',pic_id:'sa',due_date:'2026-10-01',workflow_stage:{default_role:'SA'}},{id:'b',project_id:'visible',name:'Done',status:'COMPLETED',due_date:'2026-10-01'},{id:'hidden',project_id:'hidden',name:'Private',status:'IN_PROGRESS',due_date:'2026-10-01'}],scenarios:[{id:'s',name:'On Submission Tender'}],deadlineApprovals:[],projectPlanApprovals:[],activityLogs:[],users:[],saUsers:[]},{userId:'sa',role:'SA'},'2026-10-22');
assert.deepEqual(overview.workTasks.map(t=>t.id),['a']);assert.equal(overview.projectProgress[0].scenarioKey,'ON_SUBMISSION_TENDER');
const sql=fs.readFileSync(path.join(__dirname,'../../supabase/phase35-parallel-work-and-outcome-evidence.sql'),'utf8');
for(const required of ['for update','validate_outcome_evidence','v_m.start_date>(now() at time zone','Other milestones must be completed first','v_p.active_phase_id','v_p.sales_id is distinct from p_actor_id','require_result_evidence','is_latest','uploaded_by=p_actor_id','record_business_change'])assert(sql.includes(required),required);
assert(!/drop\s+(table|column)/i.test(sql));
console.log('Workflow requirements: scheduling, scoping, mandatory outputs, evidence, account match, SQL guards. SQL not executed.');
