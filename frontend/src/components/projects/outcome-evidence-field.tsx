"use client";
import { useLanguage } from '@/components/i18n/language-provider';
export function OutcomeEvidenceField({files,onChange,disabled}:{files:File[];onChange:(files:File[])=>void;disabled:boolean}) {
  const {t}=useLanguage();
  return <label className="block space-y-2 text-sm font-medium"><span>{t('workflowUpdate.evidence')} *</span><input type="file" multiple accept=".jpg,.jpeg,.png,.pdf,.doc,.docx" disabled={disabled} onChange={event=>onChange(Array.from(event.target.files || []))} className="block w-full min-w-0 rounded-lg border border-input bg-card p-2 text-sm"/><span className="block text-xs font-normal text-muted-foreground">{t('workflowUpdate.evidenceHelp')}</span>{files.length>0&&<span className="block break-words text-xs font-normal text-muted-foreground">{files.map(f=>f.name).join(', ')}</span>}</label>;
}
