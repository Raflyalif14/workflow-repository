import { Router,RequestHandler,Response } from 'express';
import { z } from 'zod';
import { authenticateUser,AuthenticatedRequest } from '../middlewares/auth.middleware';
import { calendarEvents,listMeetings,mutateMeeting,meetingConflicts,getMeeting,saveMeetingMinutes,MeetingError } from '../services/project-meeting.service';
import { sendError,sendSuccess } from '../utils/response.util';

export function createCalendarRouter(auth:RequestHandler=authenticateUser){
 const router=Router();router.use(auth);router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
 const fail=(res:Response,error:unknown)=>sendError(res,error instanceof z.ZodError?'Check the meeting fields.':error instanceof MeetingError?error.message:'Unable to load or save the schedule.',null,error instanceof z.ZodError?422:error instanceof MeetingError?error.statusCode:503);
 router.get('/events',async(req:AuthenticatedRequest,res)=>{try{sendSuccess(res,'Calendar events.',await calendarEvents(req.user!,req.query));}catch(error){fail(res,error);}});
 router.get('/meetings',async(req:AuthenticatedRequest,res)=>{try{
  const q=z.object({projectId:z.string().uuid().optional(),status:z.enum(['PENDING','APPROVED','REJECTED','CANCELLED']).optional(),page:z.coerce.number().int().min(1).max(10000).default(1)}).parse(req.query);
  sendSuccess(res,'Project meetings.',await listMeetings(req.user!,q));
 }catch(error){fail(res,error);}});
 router.post('/projects/:projectId/meeting-conflicts',async(req:AuthenticatedRequest,res)=>{try{sendSuccess(res,'Meeting availability.',await meetingConflicts(String(req.params.projectId),req.user!,req.body));}catch(error){fail(res,error);}});
 router.post('/projects/:projectId/meetings',async(req:AuthenticatedRequest,res)=>{try{sendSuccess(res,'Meeting requested.',await mutateMeeting(String(req.params.projectId),req.user!,req.body));}catch(error){fail(res,error);}});
 router.post('/projects/:projectId/meetings/:meetingId',async(req:AuthenticatedRequest,res)=>{try{sendSuccess(res,'Meeting updated.',await mutateMeeting(String(req.params.projectId),req.user!,req.body,String(req.params.meetingId)));}catch(error){fail(res,error);}});
 router.post('/projects/:projectId/meetings/:meetingId/minutes',async(req:AuthenticatedRequest,res)=>{try{sendSuccess(res,'Meeting minutes saved.',await saveMeetingMinutes(String(req.params.projectId),String(req.params.meetingId),req.user!,req.body));}catch(error){fail(res,error);}});
 router.get('/projects/:projectId/meetings/:meetingId',async(req:AuthenticatedRequest,res)=>{try{sendSuccess(res,'Meeting details.',await getMeeting(String(req.params.projectId),String(req.params.meetingId),req.user!));}catch(error){fail(res,error);}});
 return router;
}
export default createCalendarRouter();
