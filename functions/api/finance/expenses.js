import {json,unavailable,canRead,hasSession,sameOrigin,requestJson,normalizeItems,storageKey} from "../../_finance.js";
export async function onRequestGet({request,env}){
 if(unavailable(env))return json({error:"Finance backend has not been configured."},503);
 if(!await canRead(request,env))return json({error:"Finance is locked."},401);
 try{
  const data=await env.FINANCE_KV.get(storageKey,"json");
  const items=Array.isArray(data?.items)?data.items:[];
  return json({items,updatedAt:data?.updatedAt||null,currency:"CAD"});
 }catch{return json({error:"Finance records could not be loaded."},503);}
}
export async function onRequestPut({request,env}){
 if(!sameOrigin(request))return json({error:"Invalid request"},403);
 if(unavailable(env))return json({error:"Finance backend has not been configured."},503);
 if(!await hasSession(request,env,"admin"))return json({error:"Administrator access required."},403);
 try{
  const payload=await requestJson(request,75000);
  const items=normalizeItems(payload.items);
  const updatedAt=new Date().toISOString();
  await env.FINANCE_KV.put(storageKey,JSON.stringify({items,updatedAt}));
  return json({ok:true,count:items.length,updatedAt});
 }catch(e){
  if(/Invalid|Maximum|Request too large/.test(e.message))return json({error:e.message},400);
  return json({error:"Unable to save finance records."},503);
 }
}
