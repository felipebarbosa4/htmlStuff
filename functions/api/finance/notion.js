import {json,unavailable,canRead} from "../../_finance.js";
import {snapshotKey,syncStatusKey,provisionSyncToken} from "../../_notion_sync.js";
export async function onRequestGet({request,env,waitUntil}){
 if(unavailable(env))return json({error:"Finance backend has not been configured."},503);
 if(!await canRead(request,env))return json({error:"Finance is locked."},401);
 if(env.NOTION_API_TOKEN&&typeof waitUntil==="function"){
  waitUntil(provisionSyncToken(env).catch(()=>{}));
 }
 try{
  const [data,status]=await Promise.all([env.FINANCE_KV.get(snapshotKey,"json"),env.FINANCE_KV.get(syncStatusKey,"json")]);
  if(!data||!Array.isArray(data.items))return json({error:"Notion history is not imported yet."},404);
  return json({
   source:data.source||"notion-snapshot",sourcePage:data.sourcePage||null,
   fetchedAt:data.fetchedAt||null,currency:"CAD",count:data.items.length,
   statementBalances:Array.isArray(data.statementBalances)?data.statementBalances:[],
   reviews:data.reviews||{},
   syncStatus:status?{ok:status.ok,lastAttemptAt:status.lastAttemptAt,lastSuccessAt:status.lastSuccessAt,
    count:status.count,error:status.ok?null:"A última sincronização falhou; exibindo a cópia anterior."}:null,
   items:data.items
  });
 }catch{return json({error:"The imported Notion history could not be loaded."},503);}
}
