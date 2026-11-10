import assert from 'node:assert/strict';
import React, {isValidElement, type ReactNode} from 'react';
import * as auth from '../components/auth/auth-provider';
import * as workflow from '../hooks/use-milestone-workflow';
import * as outputs from '../hooks/use-output-documents';
import * as evidence from '../hooks/use-outcome-evidence';
import {MilestoneRow} from '../components/projects/project-milestone-row';
import {Button} from '../components/ui/button';
import {Input} from '../components/ui/input';
import {Dialog} from '../components/ui/dialog';
import {NextActionCard} from '../components/projects/project-plan-summary';
import {formatContractAmountInput, parseContractAmount} from './contract-amount';
import {salesStageAction} from './sales-stage-action';
import {resolveNextAction,resolveNextActionTargetId} from './workflow-ux-helpers';
import {setActiveLanguage,translate} from '../i18n';
import type {Project,ProjectMilestonePhase4} from '../types/project';

assert.equal(salesStageAction('CREATED','2000-01-01',true,true),'START');
assert.equal(salesStageAction('CREATED','2999-01-01',true,true),'WAIT_DATE');
assert.equal(salesStageAction('CREATED','2000-01-01',true,false),'WAIT_WORK');
assert.equal(salesStageAction('CREATED',null,true,true),'NO_SCHEDULE');
assert.equal(salesStageAction('IN_PROGRESS','2000-01-01',true,true),'RESULT');
assert.equal(salesStageAction('COMPLETED','2000-01-01',true,true),null);
assert.equal(formatContractAmountInput('9000000000', '', 'insertFromPaste'), '9.000.000.000');
assert.equal(formatContractAmountInput('1.0000', '1.000', 'insertText'), '10.000');
assert.equal(formatContractAmountInput('1250,50', '', 'insertFromPaste'), '1.250,50');
assert.equal(parseContractAmount('1.250,50'), 1250.5);
for (const value of ['-500', '1250.50', '1e6', '1.250,', '1.250,501', '0', '9007199254740993']) {
  assert.equal(parseContractAmount(value), null, `Reject ${value} without changing the amount`);
}

type Element=React.ReactElement<any>;
function elements(node:ReactNode):Element[]{if(Array.isArray(node))return node.flatMap(elements);if(!isValidElement(node))return [];const el=node as Element;return [el,...elements(el.props.children)];}
const originalState=React.useState,originalRef=React.useRef;
const originals={...workflow},originalAuth=auth.useAuth,originalOutputs=outputs.useOutputDocuments,originalEvidence=evidence.useOutcomeEvidence;
let actor={id:'sales',role:'SALES'};
let evidenceResets=0;
let evidenceDiscards=0;
let discardFailed=false;
const mutation={isPending:false,mutateAsync:async()=>{}};
(React as any).useState=(initial:any)=>[typeof initial==='function'?initial():initial,()=>{}];
(React as any).useRef=(initial:any)=>({current:initial});
(auth as any).useAuth=()=>({user:actor});
(outputs as any).useOutputDocuments=()=>({data:{documents:[]},isLoading:false,isError:false});
(evidence as any).useOutcomeEvidence=()=>({files:[],isUploading:false,discard:async()=>{
  evidenceDiscards++;
  if(discardFailed) throw Error('Discard failed');
  return true;
},reset:()=>{evidenceResets++;}});
for(const hook of ['useCompleteMilestone','useStartMilestone','useRetryMilestoneProgression'])(workflow as any)[hook]=()=>mutation;
(workflow as any).useMilestoneDeadlineStatus=()=>({isLoading:true});
const project={id:'p',name:'Project',status:'ACTIVE',sales_id:'sales',sales:{id:'sales',fullName:'Sales Owner'},pic:{id:'sa'},scenario:{workflow_model:'OPERATIONAL_V2',workflow_version:2}} as Project;
const milestone={id:'m',project_id:'p',name:'Tender Process',step_order:3,status:'IN_PROGRESS',start_date:'2000-01-01',due_date:'2000-01-02',workflow_stage:{default_role:'SALES'}} as ProjectMilestonePhase4;
function row(m=milestone,expanded=true,ready=true,resultOnly=false){return MilestoneRow({project,milestone:m,isFinalMilestone:true,isCurrentStage:true,hasNextCreatedMilestone:false,expanded,onToggle(){},finalPrerequisitesComplete:ready,resultOnly});}
async function main() {
try{
 for(const locale of ['en','id'] as const){setActiveLanguage(locale);
  const tree=elements(row());
  const created = {...milestone, status:'CREATED' as const};
  const resultCard = elements(row(created,false,true,true));
  assert(resultCard.some(el=>el.type===Button&&el.props.children===translate('salesStage.result')));
  assert(!resultCard.some(el=>el.type===Button&&el.props.children===translate('salesStage.start')));
  assert(!elements(row(created,false,false,true)).some(el=>el.type===Button&&el.props.children===translate('salesStage.result')));
  assert(!elements(row({...created,start_date:'2999-01-01'},false,true,true)).some(el=>el.type===Button&&el.props.children===translate('salesStage.result')));
  assert.equal(tree.filter(el=>el.type===Button&&el.props.children===translate('salesStage.result')).length,1,'Exactly one result action');
  assert(!tree.some(el=>el.type==='span'&&el.props.children===translate('outputScope.markComplete')),'No duplicate Mark complete');
  assert(!JSON.stringify(tree).includes('Unassigned'));
  const options=tree.find(el=>el.type==='details'&&elements(el).some(child=>child.type==='summary'&&child.props.children===translate('salesStage.more')))!;
  assert(options);assert.equal(options.props.open,undefined,'Secondary options collapsed initially');
  assert.equal(elements(options).filter(el=>el.type===Button).length,2,'Deadline and supporting upload remain accessible');
  for(const expanded of [true,false])assert.equal(elements(row({...milestone,status:'CREATED'},expanded)).filter(el=>el.type===Button&&el.props.children===translate('salesStage.start')).length,1);
  assert(!elements(row({...milestone,status:'CREATED',start_date:'2999-01-01'})).some(el=>el.type===Button&&el.props.children===translate('salesStage.start')));
  assert(!elements(row({...milestone,status:'CREATED'},true,false)).some(el=>el.type===Button&&el.props.children===translate('salesStage.start')));
  const next=resolveNextAction(project,[{...milestone,status:'CREATED'}],null,actor);
  assert.equal(next.actionType,'START_MILESTONE');assert.equal(next.isWaiting,false);assert.equal(resolveNextActionTargetId(next),'project-milestone-m');
  const startCard = NextActionCard({nextAction:next,onAction(){},isSubmittingPlan:false,isResuming:false});
  assert(elements(startCard).some(el=>el.type===Button&&el.props['aria-label']===translate('salesStage.start')));
  const blocked = resolveNextAction(project,[{...milestone,status:'CREATED',start_date:'2999-01-01'}],null,actor);
  assert.equal(blocked.canPerformAction,false);assert.equal(blocked.actionType,'NONE');
  assert.equal(resolveNextAction(project,[{...milestone,status:'CREATED'}],null,{id:'other',role:'SALES'}).canPerformAction,false);
  actor={id:'other',role:'SALES'};assert(!elements(row()).some(el=>el.type===Button&&el.props.children===translate('salesStage.result')));actor={id:'sales',role:'SALES'};
  let cursor=0;
  const state = new Map<number, unknown>([[4, true], [5, 'WON'], [6, '9.000.000.000']]);
  (React as any).useState=(initial:any)=>{
    const index=cursor++;
    if(!state.has(index)) state.set(index, typeof initial==='function'?initial():initial);
    return [state.get(index), (value:unknown)=>state.set(index,value)];
  };
  const contract=elements(row()).find(el=>el.type===Input&&el.props.id==='contract-m')!;
  assert.equal(contract.props.inputMode,'decimal');assert.equal(contract.props.value,'9.000.000.000');
  contract.props.onChange({target:{value:'1250,50'},nativeEvent:{inputType:'insertFromPaste'}});
  assert.equal(state.get(6),'1.250,50');
  for(const closeWithButton of [true,false]) {
    state.set(4,true);state.set(5,'WON');state.set(6,'1.250,50');cursor=0;
    const modal=elements(row()).find(el=>el.type===Dialog&&el.props.open)!;
    const resetsBefore=evidenceResets;
    const discardsBefore=evidenceDiscards;
    if(closeWithButton) await elements(modal).find(el=>el.type===Button&&el.props.children===translate('common.cancel'))!.props.onClick();
    else await modal.props.onOpenChange(false);
    assert.equal(state.get(4),false);assert.equal(state.get(5),null);assert.equal(state.get(6),'');
    assert.equal(evidenceDiscards,discardsBefore+1,'Closing the result dialog discards uploaded drafts');
    assert.equal(evidenceResets,resetsBefore+1,'Closing the result dialog clears evidence');
  }
  state.set(4,true);cursor=0;discardFailed=true;
  await elements(row()).find(el=>el.type===Dialog&&el.props.open)!.props.onOpenChange(false);
  assert.equal(state.get(4),true,'Leave the form open so cleanup can be retried');
  assert.equal(state.get(9),'workflowUpdate.evidenceDiscardFailed');
  discardFailed=false;state.set(4,false);
  cursor=0;state.set(9,'workflowUpdate.startFailed');
  const collapsed=elements(row({...milestone,status:'CREATED'},false));
  assert(collapsed.some(el=>el.props.role==='alert'&&el.props.children===translate('workflowUpdate.startFailed')),'Start error remains visible while collapsed');
  (React as any).useState=(initial:any)=>[typeof initial==='function'?initial():initial,()=>{}];
 }
 console.log('PASS Sales ownership, one primary result/start action, collapsed secondary options, date/prerequisite gates and next-action target');
}finally{(React as any).useState=originalState;(React as any).useRef=originalRef;(auth as any).useAuth=originalAuth;(outputs as any).useOutputDocuments=originalOutputs;(evidence as any).useOutcomeEvidence=originalEvidence;Object.assign(workflow,originals);setActiveLanguage('en');}
}
main().catch((error) => { console.error(error); process.exitCode=1; });
