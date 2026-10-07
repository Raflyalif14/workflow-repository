import { ApiError } from './api-client';
import type { TranslationKey } from '@/i18n';
export type ProjectCreateInput = { name:string; customer?:string;clientName?:string;scenario_id?:string;scenarioId?:string;
  mom?:File;photos?:File[];documents?:File[];selectedDocumentKeys?:string[];estimated_revenue?:number };
export const projectCreateErrorKey = (error: unknown): TranslationKey => {
  const code=(error as {code?:string})?.code;
  const keys:Record<string,TranslationKey> = { CREATE_REQUEST_REQUIRED:'createReceipt.requestRequired',CREATE_PAYLOAD_CONFLICT:'createReceipt.conflict',
    CREATE_IN_PROGRESS:'createReceipt.processing',CREATE_STORAGE_UNCERTAIN:'createReceipt.uncertain',CREATE_ACCESS_INVALID:'createReceipt.forbidden',
    CREATE_PROJECT_DELETED:'createReceipt.deleted',CREATE_REVIEW_REQUIRED:'createReceipt.review',CREATE_RETRYABLE:'createReceipt.retryable' };
  return keys[code || ''] || 'createReceipt.retryable';
};
const normalize=(data:ProjectCreateInput)=>({name:data.name.trim(),customer:(data.customer||data.clientName||'').trim(),
  scenario_id:data.scenario_id||data.scenarioId||'',estimated_revenue:data.estimated_revenue,
  selected_keys:[...new Set(data.selectedDocumentKeys||[])].sort()});
export function createProjectCreateRequest() {
  let intent: { id:string; signature:string;files:File[];body:FormData } | undefined;
  let pending:Promise<unknown> | undefined;
  return {
    requestId: () => intent?.id,
    run<T>(data:ProjectCreateInput,send:(body:FormData,requestId:string)=>Promise<T>):Promise<T> {
      if (!data.mom || !data.photos?.length || !Number.isFinite(data.estimated_revenue) || data.estimated_revenue!<0)
        return Promise.reject(new Error('Invalid project creation inputs'));
      const normalized=normalize(data),signature=JSON.stringify(normalized),files=[data.mom,...data.photos,...(data.documents||[])];
      if (intent && (intent.signature!==signature || intent.files.length!==files.length || intent.files.some((f,i)=>f!==files[i])))
        return Promise.reject(new ApiError('Resolve the previous creation operation before editing. ',409,'CREATE_PAYLOAD_CONFLICT'));
      if (pending) return pending as Promise<T>;
      if (!intent) {
        const body=new FormData();body.append('name',normalized.name);body.append('customer',normalized.customer);
        body.append('scenario_id',normalized.scenario_id);body.append('estimated_revenue',String(normalized.estimated_revenue));body.append('mom',data.mom);
        for(const file of data.photos)body.append('photos',file);
        for(const file of data.documents||[])body.append('documents',file);
        body.append('selectedDocumentKeys',JSON.stringify(normalized.selected_keys));
        // Called only by the final confirmation, never by opening a picker/form or every HTTP retry.
        intent={id:crypto.randomUUID(),signature,files,body};
      }
      const captured=intent;
      pending=Promise.resolve().then(()=>send(captured.body,captured.id)).then(result=>{intent=undefined;return result;})
        .finally(()=>{pending=undefined;});
      return pending as Promise<T>;
    },
  };
}
