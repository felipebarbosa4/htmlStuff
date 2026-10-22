import {syncNotion,decryptNotionToken,encryptedTokenKey} from "../../functions/_notion_sync.js";
async function runScheduled(env){
 if(!env?.FINANCE_KV||!env.FINANCE_SYNC_KEY)throw Error("Finance synchronization Worker bindings unavailable");
 const encrypted=await env.FINANCE_KV.get(encryptedTokenKey,"json");
 if(!encrypted){console.warn("Finance sync awaiting one authorized Finance dashboard visit for credential provisioning");return;}
 const token=await decryptNotionToken(encrypted,env.FINANCE_SYNC_KEY);
 const result=await syncNotion({env,token});
 console.log("Finance Notion sync succeeded",JSON.stringify(result));
}
export default {
 async fetch(){return new Response("Not found",{status:404,headers:{"cache-control":"no-store"}});},
 scheduled(_event,env,ctx){ctx.waitUntil(runScheduled(env));}
};
