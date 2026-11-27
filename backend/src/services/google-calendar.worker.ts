import { randomBytes } from 'node:crypto';
import { supabaseAdmin as db } from '../config/supabase';
import { accessToken, calendarConfig, GoogleCalendarError, googleRequest, hash, meetingEvent, type CalendarMeeting } from './google-calendar.service';

const api='https://www.googleapis.com/calendar/v3';
type Connection={id:string;user_id:string;refresh_token:string;calendar_id:string|null;calendar_creation_attempted?:boolean;status:string;lease_id:string};
type Mapping={meeting_id:string;event_id:string;payload_hash:string|null;deleted:boolean};
const checked = <T extends {error:unknown}>(value:T):T => {if(value.error)throw new GoogleCalendarError('GOOGLE_STORAGE_UNAVAILABLE');return value;};
export async function synchronizeGoogleConnection(c:Connection) {
  const began=Date.now();
  const lease=async()=>{
    if(Date.now()-began>90000)throw new GoogleCalendarError('GOOGLE_SYNC_CONTINUING');
    const result=checked(await db.from('google_calendar_connections').update({lease_until:new Date(Date.now()+180000).toISOString()})
      .eq('id',c.id).eq('lease_id',c.lease_id).eq('status',c.status).select('id'));
    if(!result.data?.length)throw new GoogleCalendarError('GOOGLE_SYNC_CHANGED');
  };
  let token='';
  const request=async(path:string,method:string,body?:unknown)=>{
    await lease();
    return googleRequest(api+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  };
  let errorCode:string|null=null;
  try {
    await lease(); token=await accessToken(c.refresh_token,c.user_id);
    if(c.status==='DISCONNECTING') {
      if(c.calendar_id) {
        try{await request(`/calendars/${encodeURIComponent(c.calendar_id)}`,'DELETE');}
        catch(error){if(!(error instanceof GoogleCalendarError)||![404,410].includes(error.status))throw error;}
      }
      // Delete only our app-owned calendar and local credentials. Other Google grants are unaffected.
      checked(await db.from('google_calendar_connections').delete().eq('id',c.id).eq('lease_id',c.lease_id));
      return;
    }
    if(!c.calendar_id) {
      if(c.calendar_creation_attempted)throw new GoogleCalendarError('GOOGLE_CALENDAR_CREATION_UNCERTAIN');
      await lease();
      checked(await db.from('google_calendar_connections').update({calendar_creation_attempted:true}).eq('id',c.id).eq('lease_id',c.lease_id));
      const created=await request('/calendars','POST',{summary:'WorkflowHub',description:'Approved WorkflowHub meetings. Manage schedules in WorkflowHub.',timeZone:'Asia/Jakarta'});
      if(typeof created.id!=='string')throw new GoogleCalendarError('GOOGLE_UNAVAILABLE');
      c.calendar_id=created.id;
      checked(await db.from('google_calendar_connections').update({calendar_id:c.calendar_id}).eq('id',c.id).eq('lease_id',c.lease_id));
    }
    const desired:CalendarMeeting[]=[],mappings:Mapping[]=[];
    for(let offset=0;;offset+=500){
      await lease();
      const result=checked(await db.rpc('google_calendar_meetings',{p_user:c.user_id}).order('id').range(offset,offset+499));
      desired.push(...(result.data||[]));if((result.data||[]).length<500)break;
    }
    for(let offset=0;;offset+=500){
      await lease();
      const result=checked(await db.from('google_calendar_events').select('meeting_id,event_id,payload_hash,deleted').eq('connection_id',c.id).order('meeting_id').range(offset,offset+499));
      mappings.push(...(result.data||[]));if((result.data||[]).length<500)break;
    }
    const base=`/calendars/${encodeURIComponent(c.calendar_id!)}/events`;
    const wanted=new Set(desired.map(m=>m.id));
    // Remove cancelled meetings and meetings no longer assigned/visible to this user first.
    for(const old of mappings.filter(m=>!m.deleted&&!wanted.has(m.meeting_id))){
      try{await request(`${base}/${old.event_id}`,'DELETE');}
      catch(error){if(!(error instanceof GoogleCalendarError)||![404,410].includes(error.status))throw error;}
      checked(await db.from('google_calendar_events').update({deleted:true,payload_hash:null}).eq('connection_id',c.id).eq('meeting_id',old.meeting_id));
    }
    for(const meeting of desired){
      const body=meetingEvent(meeting),digest=hash(JSON.stringify(body));
      let mapping=mappings.find(m=>m.meeting_id===meeting.id);
      if(mapping&&!mapping.deleted&&mapping.payload_hash===digest)continue;
      if(!mapping||mapping.deleted){
        mapping={meeting_id:meeting.id,event_id:randomBytes(16).toString('hex'),payload_hash:null,deleted:false};
        // Persist the Google id before sending: a retry after a timeout reuses the same event.
        checked(await db.from('google_calendar_events').upsert({connection_id:c.id,...mapping}));
      }
      if(!mapping.payload_hash){
        try{await request(base,'POST',{id:mapping.event_id,...body});}
        catch(error){if(!(error instanceof GoogleCalendarError)||error.status!==409)throw error;
          await request(`${base}/${mapping.event_id}`,'PUT',body);}
      }else await request(`${base}/${mapping.event_id}`,'PUT',body);
      checked(await db.from('google_calendar_events').update({payload_hash:digest}).eq('connection_id',c.id).eq('meeting_id',meeting.id));
    }
  }catch(error){
    errorCode=error instanceof GoogleCalendarError?error.code:'GOOGLE_SYNC_FAILED';
    if(c.status==='DISCONNECTING'&&errorCode!=='GOOGLE_SYNC_CHANGED'){
      // Any remote cleanup failure during disconnect must clear local state so users are never trapped in DISCONNECTING.
      checked(await db.from('google_calendar_connections').delete().eq('id',c.id).eq('lease_id',c.lease_id));return;
    }
  }
  const result=await db.from('google_calendar_connections').update({lease_id:null,lease_until:null,
    next_attempt_at:new Date(Date.now()+(errorCode?300000:60000)).toISOString(),last_error:errorCode,
    ...(!errorCode?{last_synced_at:new Date().toISOString()}:{}),
    ...(errorCode==='GOOGLE_RECONNECT'&&c.status==='CONNECTED'?{status:'RECONNECT'}:{})})
    .eq('id',c.id).eq('lease_id',c.lease_id).eq('status',c.status);
  if(result.error)throw new GoogleCalendarError('GOOGLE_STORAGE_UNAVAILABLE');
}
export class GoogleCalendarWorker {
  private static timer:ReturnType<typeof setInterval>|null=null;
  private static running=false;
  static async tick(){
    if(this.running||!calendarConfig().ready)return;
    this.running=true;
    try{
      // Leases serialize each account across processes; per-account work is time bounded.
      for(let i=0;i<10;i++){
        const claimed=checked(await db.rpc('claim_google_calendar_connection'));
        if(!claimed.data?.length)break;
        await synchronizeGoogleConnection(claimed.data[0]);
      }
    }catch{console.warn('Google Calendar sync is temporarily unavailable.');}
    finally{this.running=false;}
  }
  static start(){if(this.timer||!calendarConfig().ready)return;this.timer=setInterval(()=>void this.tick(),15000);this.timer.unref();void this.tick();}
  static stop(){if(this.timer)clearInterval(this.timer);this.timer=null;}
}
