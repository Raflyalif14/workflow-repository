"use client";
import {useLanguage} from '@/components/i18n/language-provider';
import {Button} from '@/components/ui/button';
export function ListPagination({page,pages,total,pageSize,onPageChange,disabled=false}:{page:number;pages:number;total:number;pageSize:number;onPageChange:(page:number)=>void;disabled?:boolean}){
 const {t}=useLanguage();
 const displayPages = Math.max(1, pages);
 return <nav aria-label={t('documentPage.pagination')} className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs sm:px-5">
 <div className="space-y-1 text-muted-foreground"><p>{t('listPaging.summary',{from:total?(page-1)*pageSize+1:0,to:Math.min(page*pageSize,total),total,page,pages:displayPages})}</p><p>{t('listPaging.limit',{count:pageSize})}</p></div>
 {pages>1&&<div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={disabled||page<=1} onClick={()=>onPageChange(Math.max(1,page-1))}>{t('projectsList.previous')}</Button><Button type="button" size="sm" variant="outline" disabled={disabled||page>=pages} onClick={()=>onPageChange(Math.min(pages,page+1))}>{t('common.next')}</Button></div>}
 </nav>;
}
