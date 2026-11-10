import assert from 'node:assert/strict';
import {dateKey,eventsOnDay,monthGrid,offsetDate} from './calendar-view';
import type {CalendarEvent} from '@/hooks/use-calendar';
for(const month of [new Date(2026,10,1),new Date(2028,1,1)]){
 const grid=monthGrid(month);assert.equal(grid.length,42);assert.equal(grid[0].getDay(),1);
 assert.equal(new Set(grid.map(dateKey)).size,42);
 assert(grid.some(day=>dateKey(day)===dateKey(month)));
 assert.equal(Date.parse(offsetDate(grid[0])),grid[0].getTime(),'Local midnight retains its real instant');
}
assert(monthGrid(new Date(2028,1,1)).some(day=>dateKey(day)==='2028-02-29'));
const start=new Date(2026,10,10,23),end=new Date(2026,10,11,0);
const event={id:'meeting',kind:'meeting',title:'Meeting',projectId:'p',projectName:'P',start:start.toISOString(),end:end.toISOString(),allDay:false,status:'APPROVED',href:'/projects/p'} as CalendarEvent;
const milestone={...event,id:'milestone',kind:'milestone-due',allDay:true,start:'2026-11-11',end:'2026-11-11'} as CalendarEvent;
assert.deepEqual(eventsOnDay([event,milestone],new Date(2026,10,10)).map(e=>e.id),['meeting']);
assert.deepEqual(eventsOnDay([event,milestone],new Date(2026,10,11)).map(e=>e.id),['milestone'],'Meeting ending at midnight does not spill into the next day');
const overnight={...event,end:new Date(2026,10,11,1).toISOString()};
assert.equal(eventsOnDay([overnight],new Date(2026,10,11)).length,1);
const startOnly={...event,end:null};
assert.equal(eventsOnDay([startOnly],new Date(2026,10,10)).length,1);
assert.equal(eventsOnDay([startOnly],new Date(2026,10,11)).length,0,'Unknown end does not spill into future days');
assert.equal(eventsOnDay([{...startOnly,start:end.toISOString()}],new Date(2026,10,11)).length,1,'Start at midnight belongs to that day');
console.log('PASS calendar weeks, leap day, date-only milestones, local offsets and overnight boundaries');
