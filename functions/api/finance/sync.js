import {json,unavailable,canRead,sameOrigin} from "../../_finance.js";
import {provisionSyncToken,syncNotion} from "../../_notion_sync.js";
// Explicit user action only. Requires signed PIN cookie and same-origin POST.
export async function onRequestPost({request,env}){
 if(!sameOrigin(request))return json({error:"Invalid request origin"},403);
 if(unavailable(env))return json({error:"Finance backend has not been configured."},503);
 if(!await canRead(request,env))return json({error:"Finance is locked."},401);
 if(!env.NOTION_API_TOKEN)return json({error:"Notion connection is not configured."},503);
 try{
  await provisionSyncToken(env);
  return json(await syncNotion({env}));
 }catch(error){
  console.error("Private Notion finance refresh failed",String(error.message).slice(0,220));
  return json({error:"A sincronização não foi concluída. Os últimos dados válidos foram preservados."},503);
 }
}
