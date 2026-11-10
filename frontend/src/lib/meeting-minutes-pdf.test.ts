import assert from 'node:assert/strict';
import {meetingMinutesPdf,meetingMinutesFilename} from './meeting-minutes-pdf';
import type {Meeting} from '@/hooks/use-calendar';
const meeting:Meeting={id:'12345678-0000-4000-8000-000000000001',projectId:'p',projectName:'Project & Customer',picName:'Assigned SA',title:'Review / architecture',agenda:'',location:'Office',startsAt:'2030-01-02T03:00:00Z',endsAt:null,status:'APPROVED',revision:3,reviewNote:null,reviewedAt:null,minutes:{notes:'User notes <keep as text>\n'+('Long paragraph. '.repeat(650)),decisions:'Approved proposal',followUp:'SA: next week'},minutesAuthor:'Author',minutesUpdatedAt:'2030-01-02T05:00:00Z'};
for(const language of ['en','id'] as const){
 const pdf=meetingMinutesPdf(meeting,language,'Asia/Jakarta');const content=JSON.stringify(pdf.content);
 for(const text of [meeting.title,meeting.projectName,meeting.picName,meeting.minutes!.notes,meeting.minutes!.decisions,meeting.minutes!.followUp,'Asia/Jakarta'])assert(content.includes(JSON.stringify(text).slice(1,-1)));
 assert(!content.includes('Invalid Date'));assert(content.includes(language==='en'?'End time not set':'Waktu selesai belum ditentukan'));
}
assert.throws(()=>meetingMinutesPdf({...meeting,minutes:null},'en'),/No saved/);
assert.equal(meetingMinutesFilename(meeting),'MoM-Review-architecture-12345678.pdf');
console.log('PASS MoM PDF EN/ID, exact long text, timezone, unknown end, empty guard and safe filename');
