import type {Content,TDocumentDefinitions} from 'pdfmake/interfaces';
import type {Meeting} from '@/hooks/use-calendar';
import {translate,type AppLanguage} from '@/i18n';
export function meetingMinutesPdf(meeting:Meeting,language:AppLanguage,zone=Intl.DateTimeFormat().resolvedOptions().timeZone):TDocumentDefinitions{
 if(!meeting.minutes?.notes?.trim())throw new Error('No saved meeting minutes');
 const t=(key:Parameters<typeof translate>[0],params={})=>translate(key,params,language);
 const missing=t('common.notAvailable');
 const date=(value?:string|null)=>value?new Intl.DateTimeFormat(language==='id'?'id-ID':'en-US',{dateStyle:'medium',timeStyle:'short',timeZone:zone}).format(new Date(value)):missing;
 const metadata=[['Project',meeting.projectName],[t('meetings.name'),meeting.title],[t('meetings.starts'),date(meeting.startsAt)],[t('meetings.ends'),meeting.endsAt?date(meeting.endsAt):t('meetings.endUnknown')],['PIC SA',meeting.picName||missing],[t('meetings.location'),meeting.location||missing]];
 const sections:Content[]=(['notes','decisions','followUp'] as const).flatMap(key=>[
 {text:t(`meetings.${key}`),bold:true,fontSize:12,color:'#1E40AF',margin:[0,18,0,6]},
 {text:meeting.minutes![key]||missing,margin:[0,0,0,4],preserveLeadingSpaces:true},
 ]);
 return {pageSize:'A4',pageMargins:[40,42,40,48],info:{title:`MoM - ${meeting.title}`,author:'WorkflowHub'},
 defaultStyle:{font:'Roboto',fontSize:10,lineHeight:1.25,color:'#172033'},
 footer:(page,pages)=>({margin:[40,14,40,0],columns:[{text:'WorkflowHub',fontSize:8,color:'#64748B'},{text:`${t('reportExport.page')} ${page} ${t('reportExport.of')} ${pages}`,alignment:'right',fontSize:8,color:'#64748B'}]}),
 content:[{text:'WORKFLOWHUB',bold:true,color:'#2563EB',fontSize:10,characterSpacing:2,margin:[0,0,0,8]},
 {text:t('meetings.minutesTitle'),bold:true,fontSize:23,margin:[0,0,0,6]},
 {text:t('meetings.minutesSnapshot'),color:'#64748B',fontSize:9,margin:[0,0,0,18]},
 {table:{widths:[110,'*'],body:metadata.map(([label,value])=>[{text:label,bold:true,fillColor:'#EFF6FF'},{text:value}])},layout:{hLineWidth:()=>0,vLineWidth:()=>0,paddingTop:()=>6,paddingBottom:()=>6,paddingLeft:()=>8,paddingRight:()=>8}},
 {text:t('meetings.exportTimezone',{zone}),fontSize:8,color:'#64748B',margin:[0,8,0,0]},...sections,
 {text:t('meetings.minutesUpdated',{name:meeting.minutesAuthor||missing,date:date(meeting.minutesUpdatedAt)}),fontSize:8,color:'#64748B',margin:[0,20,0,0]}]};
}
export function meetingMinutesFilename(meeting:Pick<Meeting,'title'|'id'>){
 const safe=meeting.title.normalize('NFKC').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,65)||'meeting';
 return `MoM-${safe}-${meeting.id.slice(0,8)}.pdf`;
}
export async function createMeetingMinutesPdf(meeting:Meeting,language:AppLanguage){
 const [{default:pdfMake},{default:fonts}]=await Promise.all([import('pdfmake/build/pdfmake'),import('pdfmake/build/vfs_fonts')]);
 pdfMake.addVirtualFileSystem(fonts);
 return pdfMake.createPdf(meetingMinutesPdf(meeting,language)).getBlob();
}
