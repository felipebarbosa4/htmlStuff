import {json,unavailable,sameOrigin,requestJson,secureEquals,checkAttempt,cookieFor} from "../../_finance.js";
export async function onRequestPost({request,env}){
 if(!sameOrigin(request))return json({error:"Invalid request"},403);
 if(unavailable(env))return json({error:"Finance backend has not been configured."},503);
 try{
  const data=await requestJson(request,500);
  const pass=String(data.password||"");
  const valid=/^\d{6}$/.test(pass)&&await secureEquals(pass,env.FINANCE_PIN);
  if(!await checkAttempt(request,env,"admin",valid))return json({error:"Invalid credentials or too many attempts."},401);
  return json({ok:true,expiresIn:1200},200,{"set-cookie":await cookieFor(env,"admin",1200)});
 }catch{return json({error:"Invalid request"},400);}
}
