import type {CalendarEvent} from '@/hooks/use-calendar';
export const dateKey=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export const localInputValue=(date:Date)=>`${dateKey(date)}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
export function offsetDate(date:Date){
 const minutes=-date.getTimezoneOffset(),sign=minutes<0?'-':'+';
 return `${localInputValue(date)}:00${sign}${String(Math.floor(Math.abs(minutes)/60)).padStart(2,'0')}:${String(Math.abs(minutes)%60).padStart(2,'0')}`;
}
export function monthGrid(month:Date){
 const start=new Date(month.getFullYear(),month.getMonth(),1);start.setDate(start.getDate()-(start.getDay()+6)%7);
 return Array.from({length:42},(_,index)=>new Date(start.getFullYear(),start.getMonth(),start.getDate()+index));
}
export function eventsOnDay(events:CalendarEvent[],day:Date){
 const key=dateKey(day),start=new Date(day.getFullYear(),day.getMonth(),day.getDate()).getTime(),end=new Date(day.getFullYear(),day.getMonth(),day.getDate()+1).getTime();
 return events.filter(event=>event.allDay?event.start===key:!event.end
  ?Date.parse(event.start)>=start&&Date.parse(event.start)<end
  :Date.parse(event.start)<end&&Date.parse(event.end)>start);
}
