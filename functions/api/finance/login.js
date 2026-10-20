import {json,unavailable,sameOrigin,requestJson,secureEquals,checkAttempt,cookieFor} from "../../_finance.js";
export async function onRequestPost({request,env}){
 if(!sameOrigin(request))return json({error:"Invalid request"},403);
 if(unavailable(env))return json({error:"Finance backend has not been configured."},503);
 try{
  const data=await requestJson(request,500);
  const supplied=String(data.pin||"");
  const valid=/^\d{6}$/.test(supplied)&&await secureEquals(supplied,env.FINANCE_PIN);
  if(!await checkAttempt(request,env,"view",valid))return json({error:"Invalid PIN or too many attempts."},401);
  return json({ok:true,expiresIn:180},200,{"set-cookie":await cookieFor(env,"view",180)});
 }catch{return json({error:"Invalid request"},400);}
}
