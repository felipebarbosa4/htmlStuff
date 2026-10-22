import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import {createNotionClient,mapNotionData,encryptNotionToken,decryptNotionToken,
 syncNotion,dataSourceIds,snapshotKey,syncStatusKey,encryptedTokenKey,provisionSyncToken} from "../functions/_notion_sync.js";
import {onRequestPost} from "../functions/api/finance/sync.js";
import {cookieFor} from "../functions/_finance.js";
class MemoryKV{
 constructor(){this.data=new Map();}
 async get(key,type){const v=this.data.get(key);return type==="json"&&v?JSON.parse(v):v??null;}
 async put(key,value){this.data.set(key,value);}
}
const pair=generateKeyPairSync("rsa",{modulusLength:2048,publicKeyEncoding:{format:"der",type:"spki"},privateKeyEncoding:{format:"der",type:"pkcs8"}});
const testPublic=pair.publicKey.toString("base64");
const testPrivate=pair.privateKey.toString("base64");
const expense={id:"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",object:"page",
 properties:{Expense:{title:[{plain_text:"Groceries"}]},Amount:{number:24.50},
 Date:{date:{start:"2026-10-21"}},Account:{relation:[{id:"a1"}]},Category:{relation:[{id:"c1"}]}}};
const account={id:"a1",object:"page",properties:{Account:{title:[{plain_text:"RBC Chequing"}]}}};
const category={id:"c1",object:"page",properties:{Category:{title:[{plain_text:"Food"}]}}};
const raw={expense:[expense],income:[],transfer:[],account:[account],category:[category]};
const request=(status,body)=>({status,ok:status===200,headers:new Headers(),json:async()=>body});
test("Notion mapping keeps transfers separate from expense and respects historic statements",()=>{
 const r=mapNotionData(raw,{statementBalances:[{name:"Past statement",amount:321}],reviews:{unclassifiedETransfers:13}});
 assert.equal(r.count,1);assert.equal(r.items[0].account,"RBC Chequing");
 assert.equal(r.items[0].category,"Food");
 assert.equal(r.statementBalances[0].amount,321);
 assert.equal(r.reviews.unclassifiedETransfers,13);
});
test("Notion client paginates without duplication",async()=>{
 const list=[{...expense,id:"id1"},{...expense,id:"id2"}];let calls=0;
 const client=createNotionClient("synthetic-test-token-long",{fetcher:async()=>{
  calls++;return request(200,calls===1?{results:list.slice(0,1),has_more:true,next_cursor:"next"}:
   {results:list,has_more:false,next_cursor:null});
 },delay:async()=>{}});
 const rows=await client.all(dataSourceIds.expense);
 assert.equal(rows.length,2);assert.equal(calls,2);
});
test("Token encrypted with separate 256-bit secret and decrypts without plaintext in KV",async()=>{
 const cipher=await encryptNotionToken("secret_notion_placeholder",testPublic);
 assert.doesNotMatch(JSON.stringify(cipher),/secret_notion_placeholder/);
 assert.equal(await decryptNotionToken(cipher,testPrivate),"secret_notion_placeholder");
 const env={FINANCE_KV:new MemoryKV(),NOTION_API_TOKEN:"secret_notion_placeholder",};
 assert.equal(await provisionSyncToken(env),true);
 assert.equal((await env.FINANCE_KV.get(encryptedTokenKey,"json")).version,2);
});
test("Atomic snapshot: failing a data source never replaces stored snapshot",async()=>{
 const kv=new MemoryKV();
 await kv.put(snapshotKey,JSON.stringify({items:[{id:"original"}],statementBalances:[]}));
 const env={FINANCE_KV:kv,NOTION_API_TOKEN:"synthetic-test-token-long"};
 await assert.rejects(syncNotion({env,fetcher:async()=>request(403,{})}),/access denied/);
 assert.equal((await kv.get(snapshotKey,"json")).items[0].id,"original");
 assert.equal((await kv.get(syncStatusKey,"json")).ok,false);
});
test("Manual sync blocks unauthorized POST and wrong origin",async()=>{
 const env={FINANCE_PIN:"000000",FINANCE_SESSION_SECRET:"synthetic-signature-key-".repeat(3),FINANCE_KV:new MemoryKV()};
 const badReq=new Request("https://example.org/api/finance/sync",{method:"POST",
  headers:{"origin":"https://evil.org","content-type":"application/json"},body:"{}"});
 assert.equal((await onRequestPost({request:badReq,env})).status,403);
 const goodReq=new Request("https://example.org/api/finance/sync",{method:"POST",
  headers:{"origin":"https://example.org","content-type":"application/json"},body:"{}"});
 assert.equal((await onRequestPost({request:goodReq,env})).status,401);
 const cookie=(await cookieFor(env,"view",90)).split(";")[0];
 const withoutToken=new Request("https://example.org/api/finance/sync",{method:"POST",
  headers:{"cookie":cookie,"origin":"https://example.org","content-type":"application/json"},body:"{}"});
 assert.equal((await onRequestPost({request:withoutToken,env})).status,503);
});