import { Router } from 'express';
import { z } from 'zod';
import { authenticateUser,AuthenticatedRequest } from '../middlewares/auth.middleware';
import { sendError,sendSuccess } from '../utils/response.util';
import { beginGoogleConnection,completeGoogleConnection,connectionStatus,disconnectGoogle,GoogleCalendarError } from '../services/google-calendar.service';

const router=Router();
router.use(authenticateUser);
router.use((req:AuthenticatedRequest,res,next)=>{
  res.setHeader('Cache-Control','no-store');
  if(!req.user||!['SA','SALES','HEAD_SA'].includes(req.user.role)){sendError(res,'Not available for this role.',null,403);return;}
  next();
});
const actions={
  status:(id:string)=>connectionStatus(id),
  connect:(id:string)=>beginGoogleConnection(id),
  disconnect:(id:string)=>disconnectGoogle(id),
  complete:(id:string,body:unknown)=>{const input=z.object({code:z.string().min(1).max(4096),state:z.string().min(32).max(256)}).strict().parse(body);return completeGoogleConnection(id,input.code,input.state);},
};
for(const [name,action] of Object.entries(actions)){
  router[name==='status'?'get':'post']('/'+name,async(req:AuthenticatedRequest,res)=>{
    try{sendSuccess(res,'Google Calendar.',await action(req.user!.userId,req.body));}
    catch(error){const code=error instanceof GoogleCalendarError?error.code:error instanceof z.ZodError?'GOOGLE_INPUT_INVALID':'GOOGLE_UNAVAILABLE';
      sendError(res,'Google Calendar request could not be completed.',{code},error instanceof GoogleCalendarError?Math.min(error.status,503):error instanceof z.ZodError?422:503);}
  });
}
export default router;
