import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { supabaseAdmin as db } from '../config/supabase';

export const calendarScope = 'https://www.googleapis.com/auth/calendar.app.created';
export class GoogleCalendarError extends Error {
  constructor(readonly code: string, readonly status = 503) { super(code); }
}
export function calendarConfig() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '';
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI || '';
  const key = process.env.GOOGLE_CALENDAR_TOKEN_KEY || '';
  const appUrl = process.env.GOOGLE_CALENDAR_APP_URL || '';
  const validUrl = (value: string) => {
    try { const u = new URL(value); return !u.username && !u.password && (u.protocol === 'https:' || u.protocol === 'http:' && ['localhost','127.0.0.1'].includes(u.hostname)); } catch { return false; }
  };
  return { clientId, clientSecret, redirectUri, key, appUrl,
    ready: !!clientId && !!clientSecret && /^[0-9a-f]{64}$/i.test(key) && validUrl(redirectUri) && validUrl(appUrl) };
}
export function hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
export function encryptToken(value: string, owner: string): string {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', Buffer.from(calendarConfig().key,'hex'),iv);
  cipher.setAAD(Buffer.from(owner));
  const content = Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return [iv,cipher.getAuthTag(),content].map(v=>v.toString('base64url')).join('.');
}
export function decryptToken(value: string, owner: string): string {
  const [iv,tag,content] = value.split('.').map(v=>Buffer.from(v,'base64url'));
  const cipher = createDecipheriv('aes-256-gcm',Buffer.from(calendarConfig().key,'hex'),iv);
  cipher.setAAD(Buffer.from(owner)); cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(content),cipher.final()]).toString('utf8');
}
export async function googleRequest(url: string, options: RequestInit = {}): Promise<any> {
  let response: globalThis.Response;
  try { response = await fetch(url,{...options,signal:AbortSignal.timeout(12000),redirect:'error'}); }
  catch { throw new GoogleCalendarError('GOOGLE_UNAVAILABLE'); }
  if (!response.ok) {
    // Never surface Google's raw response: it can contain account/token information.
    const body = await response.json().catch(()=>({})) as any;
    if (body.error === 'invalid_grant' || response.status === 401) throw new GoogleCalendarError('GOOGLE_RECONNECT',401);
    throw new GoogleCalendarError(`GOOGLE_HTTP_${response.status}`,response.status);
  }
  return response.status === 204 ? null : response.json();
}
async function tokenRequest(fields: Record<string,string>) {
  const c=calendarConfig();
  return googleRequest('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:c.clientId,client_secret:c.clientSecret,...fields})});
}
export async function accessToken(encrypted: string, owner: string): Promise<string> {
  const result = await tokenRequest({grant_type:'refresh_token',refresh_token:decryptToken(encrypted,owner)});
  if (typeof result.access_token !== 'string') throw new GoogleCalendarError('GOOGLE_UNAVAILABLE');
  return result.access_token;
}
export function requireGoogleConfig() { if (!calendarConfig().ready) throw new GoogleCalendarError('GOOGLE_NOT_CONFIGURED'); }
export async function connectionStatus(userId: string) {
  if (!calendarConfig().ready) return {configured:false,status:'NOT_CONNECTED',lastSyncedAt:null,lastError:null};
  const {data,error}=await db.from('google_calendar_connections').select('status,last_synced_at,last_error').eq('user_id',userId).maybeSingle();
  if(error) throw new GoogleCalendarError('GOOGLE_STORAGE_UNAVAILABLE');
  return {configured:true,status:data?.status || 'NOT_CONNECTED',lastSyncedAt:data?.last_synced_at || null,lastError:data?.last_error || null};
}
export async function beginGoogleConnection(userId: string) {
  requireGoogleConfig();
  const current = await connectionStatus(userId);
  if (current.status !== 'NOT_CONNECTED') throw new GoogleCalendarError('GOOGLE_ALREADY_CONNECTED',409);
  const state=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');
  const {error}=await db.from('google_calendar_oauth').upsert({user_id:userId,state_hash:hash(state),verifier:encryptToken(verifier,userId),expires_at:new Date(Date.now()+600000).toISOString()});
  if(error) throw new GoogleCalendarError('GOOGLE_STORAGE_UNAVAILABLE');
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search=new URLSearchParams({client_id:calendarConfig().clientId,redirect_uri:calendarConfig().redirectUri,response_type:'code',
    scope:calendarScope,access_type:'offline',prompt:'consent',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();
  return {url:url.toString()};
}
export async function completeGoogleConnection(userId: string, code: string, state: string) {
  requireGoogleConfig();
  const {data,error}=await db.rpc('consume_google_calendar_oauth',{p_user:userId,p_state:hash(state)});
  if(error) throw new GoogleCalendarError('GOOGLE_STORAGE_UNAVAILABLE');
  if(!data?.length) throw new GoogleCalendarError('GOOGLE_STATE_INVALID',400);
  const token=await tokenRequest({grant_type:'authorization_code',code,redirect_uri:calendarConfig().redirectUri,code_verifier:decryptToken(data[0].verifier,userId)});
  if(!token.refresh_token || !String(token.scope||'').split(' ').includes(calendarScope)) throw new GoogleCalendarError('GOOGLE_CONSENT_REQUIRED',400);
  const saved=await db.from('google_calendar_connections').insert({user_id:userId,refresh_token:encryptToken(token.refresh_token,userId)});
  if(saved.error) throw new GoogleCalendarError('GOOGLE_CONNECTION_NOT_SAVED');
  return {connected:true};
}
export async function disconnectGoogle(userId: string) {
  requireGoogleConfig();
  const clear=await db.from('google_calendar_oauth').delete().eq('user_id',userId);
  if(clear.error) throw new GoogleCalendarError('GOOGLE_STORAGE_UNAVAILABLE');
  const result=await db.from('google_calendar_connections').update({status:'DISCONNECTING',next_attempt_at:new Date().toISOString()}).eq('user_id',userId);
  if(result.error) throw new GoogleCalendarError('GOOGLE_STORAGE_UNAVAILABLE');
  return {disconnecting:true};
}

export type CalendarMeeting = {id:string;title:string;agenda:string;location:string;starts_at:string;ends_at:string|null;project_id:string;project_name:string};
export function meetingEvent(meeting: CalendarMeeting) {
  const link=new URL(`/projects/${encodeURIComponent(meeting.project_id)}`,calendarConfig().appUrl).toString();
  const estimated=!meeting.ends_at;
  return {summary:`${meeting.project_name} — ${meeting.title}`,location:meeting.location || '',
    description:[meeting.agenda,estimated?'End time is unknown. This 30-minute slot is an estimate only.':'',`Manage this meeting in WorkflowHub: ${link}`].filter(Boolean).join('\n\n'),
    start:{dateTime:meeting.starts_at},end:{dateTime:meeting.ends_at || new Date(Date.parse(meeting.starts_at)+30*60000).toISOString()},
    transparency:estimated?'transparent':'opaque',extendedProperties:{private:{workflowMeetingId:meeting.id}}};
}
