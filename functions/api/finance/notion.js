import {json,unavailable,canRead} from "../../_finance.js";

// Private, read-only historical Notion import. Separate from fixed monthly budgets.
// Snapshot is populated with Wrangler directly to private Workers KV, never in Git.
const snapshotKey="finance:notion:snapshot:v1";
export async function onRequestGet({request,env}){
 if(unavailable(env))return json({error:"Finance backend has not been configured."},503);
 if(!await canRead(request,env))return json({error:"Finance is locked."},401);
 try{
  const data=await env.FINANCE_KV.get(snapshotKey,"json");
  if(!data||!Array.isArray(data.items))return json({error:"Notion history is not imported yet."},404);
  // Explicit allowlist: no unrelated secrets/fields can be echoed from KV.
  return json({
   source:data.source||"notion-snapshot",
   sourcePage:data.sourcePage||null,
   fetchedAt:data.fetchedAt||null,
   currency:"CAD",
   count:data.items.length,
   statementBalances:Array.isArray(data.statementBalances)?data.statementBalances:[],
   reviews:data.reviews||{},
   items:data.items
  });
 }catch{return json({error:"The imported Notion history could not be loaded."},503);}
}
