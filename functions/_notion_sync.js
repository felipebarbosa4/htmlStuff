// Shared read-only Notion -> Cloudflare KV synchronization.
 // No financial information or Notion bearer tokens belong in the public repository.
const notionApi="https://api.notion.com/v1";
const notionVersion="2025-09-03";
export const dataSourceIds={
 expense:"2a9738ef-286c-8277-8259-072d428be72a",
 income:"448738ef-286c-8253-9472-87be4563f25c",
 transfer:"8e5738ef-286c-82b3-9ccc-073ce595118c",
 account:"88f738ef-286c-82f1-ba35-87261b5b0d43",
 category:"f6e738ef-286c-8363-92fc-879964b74bec"
};
export const snapshotKey="finance:notion:snapshot:v1";
export const syncStatusKey="finance:notion:sync-status:v1";
export const encryptedTokenKey="finance:notion:token-encrypted:v1";
const trackerPage="https://app.notion.com/p/78c738ef286c8391bc1f81d3e751ac3c";
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const title=(page,key)=>{
 const value=page?.properties?.[key];
 const parts=value?.title||value?.rich_text||[];
 return parts.map(part=>part?.plain_text||part?.text?.content||"").join("").trim();
};
const relation=(page,key)=>page?.properties?.[key]?.relation?.[0]?.id||"";
const date=(page)=>page?.properties?.Date?.date?.start?.slice(0,10)||"";
const amount=(page)=>Number(page?.properties?.Amount?.number??0);
const normId=value=>String(value||"").replace(/-/g,"").toLowerCase();
const pageId=page=>normId(page.id);
const stableDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||"")?value:"";
const failureMessage=error=>{
 const raw=String(error?.message||error);
 return raw.slice(0,260).replace(/Bearer\s+\S+/gi,"Bearer [REDACTED]");
};
export function createNotionClient(token,{fetcher=fetch,delay=pause}={}){
 if(typeof token!=="string"||token.length<12)throw Error("NOTION_API_TOKEN not configured");
 let lastCallAt=0;
 async function query(id,cursor){
  for(let attempt=0;attempt<4;attempt++){
   const elapsed=Date.now()-lastCallAt;
   if(elapsed<375)await delay(375-elapsed);
   lastCallAt=Date.now();
   const response=await fetcher(notionApi+"/data_sources/"+id+"/query",{
    method:"POST",
    headers:{"authorization":"Bearer "+token,"Notion-Version":notionVersion,"content-type":"application/json"},
    body:JSON.stringify({page_size:100,...(cursor?{start_cursor:cursor}:{})})
   });
   if(response.status===429||response.status===502||response.status===503||response.status===504){
    if(attempt===3)throw Error("Notion rate limited or unavailable (HTTP "+response.status+")");
    const seconds=Number(response.headers.get("retry-after"));
    await delay(Number.isFinite(seconds)&&seconds>0?Math.min(seconds*1000,12000):1000*(attempt+1));
    continue;
   }
   if(!response.ok){
    if(response.status===403||response.status===404)throw Error("Notion source access denied: "+id+" (HTTP "+response.status+")");
    if(response.status===401)throw Error("Notion token not authorized (HTTP 401)");
    throw Error("Notion API request failed (HTTP "+response.status+")");
   }
   const body=await response.json();
   if(!Array.isArray(body.results)||typeof body.has_more!=="boolean")throw Error("Malformed Notion API response");
   return body;
  }
  throw Error("Notion retry exhausted");
 }
 return {
  async all(id){
   let cursor=null;
   const rows=[];const seen=new Set();
   for(let page=0;page<100;page++){
    const res=await query(id,cursor);
    for(const row of res.results){
     if(row?.object!=="page"||!row.id)continue;
     if(!seen.has(row.id)){seen.add(row.id);rows.push(row);}
    }
    if(!res.has_more)return rows;
    if(!res.next_cursor||res.next_cursor===cursor)throw Error("Broken Notion pagination cursor");
    cursor=res.next_cursor;
   }
   throw Error("Notion database unexpectedly exceeds pagination safety cap");
  }
 };
}
export function mapNotionData(raw, previous, fetchedAt=new Date().toISOString()){
 const accounts=new Map(raw.account.map(x=>[pageId(x),title(x,"Account")||"Conta não identificada"]));
 const categories=new Map(raw.category.map(x=>[pageId(x),title(x,"Category")||"Sem categoria"]));
 const lookup=(p,k,map,defaultText)=>map.get(normId(relation(p,k)))||defaultText;
 const items=[];
 for(const p of raw.expense){
  items.push({id:pageId(p),kind:"expense",date:stableDate(date(p)),title:title(p,"Expense")||"Despesa",
   amount:amount(p),account:lookup(p,"Account",accounts,"Conta não informada"),
   category:lookup(p,"Category",categories,"Sem categoria")});
 }
 for(const p of raw.income){
  items.push({id:pageId(p),kind:"income",date:stableDate(date(p)),title:title(p,"Income")||"Entrada",
   amount:amount(p),account:lookup(p,"Accounts",accounts,"Conta não informada"),
   category:p?.properties?.Source?.select?.name||"Receita"});
 }
 for(const p of raw.transfer){
  items.push({id:pageId(p),kind:"transfer",date:stableDate(date(p)),title:title(p,"Transactions")||"Transferência",
   amount:amount(p),account:lookup(p,"From Account",accounts,"Conta não informada"),
   toAccount:lookup(p,"To Account",accounts,"Conta não informada"),category:"Transferência interna"});
 }
 if(items.some(x=>!Number.isFinite(x.amount)))throw Error("Invalid Notion amount");
 items.sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
 return {source:"notion-api",sourcePage:trackerPage,fetchedAt,currency:"CAD",count:items.length,
  // Historic statement amounts must NEVER be promoted to current balances.
  statementBalances:Array.isArray(previous?.statementBalances)?previous.statementBalances:[],
  reviews:previous?.reviews||{},items};
}
export async function syncNotion({env,token=env.NOTION_API_TOKEN,fetcher=fetch,delay=pause}){
 if(!env?.FINANCE_KV)throw Error("Finance private KV binding missing");
 const attemptAt=new Date().toISOString();
 const client=createNotionClient(token,{fetcher,delay});
 try{
  // Fetch all datasets before writing anything so an incomplete update never replaces good records.
  const raw={};
  for(const [kind,id] of Object.entries(dataSourceIds))raw[kind]=await client.all(id);
  const previous=await env.FINANCE_KV.get(snapshotKey,"json");
  const snapshot=mapNotionData(raw,previous,new Date().toISOString());
  await env.FINANCE_KV.put(snapshotKey,JSON.stringify(snapshot));
  await env.FINANCE_KV.put(syncStatusKey,JSON.stringify({
   ok:true,lastAttemptAt:attemptAt,lastSuccessAt:snapshot.fetchedAt,count:snapshot.count
  }));
  return {ok:true,lastSuccessAt:snapshot.fetchedAt,count:snapshot.count};
 }catch(error){
  const previous=await env.FINANCE_KV.get(syncStatusKey,"json").catch(()=>null);
  await env.FINANCE_KV.put(syncStatusKey,JSON.stringify({
   ok:false,lastAttemptAt:attemptAt,lastSuccessAt:previous?.lastSuccessAt||null,
   count:previous?.count||null,error:failureMessage(error)
  })).catch(()=>{});
  throw error;
 }
}
function base64(bytes){let s="";for(const x of bytes)s+=String.fromCharCode(x);return btoa(s);}
function unbase64(s){return Uint8Array.from(atob(s),x=>x.charCodeAt(0));}
// Public key is safe to publish; the matching private key only exists as a Worker secret.
const FINANCE_SYNC_PUBLIC_KEY="MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA60cu263/wulF5FfuxUurQbLbOOi01BXcH0+1dMkPezbUzBXbCKSu9BaCoyzNPIzsGCMeo2ESVGGVUqV1KcnJi2wm3iF0BDEr2jl0kOsS++9Lp0I3c+U1MGJPhgmMwwjct/wjMbyDsOWKudsOKi4UpCsj3q/uaUPcqpzDMq0SWX0uw7aOtvFRwUoSNVmUqVA1AtoLCBxijM0xg72gJWiaUIw8AoR3GXxuYo1ZOJ85WMf5+LSk0yoNhsTfrJL3LLP9qqt+LuGQcms9q/gtEmYa+gFhbA5+oJjKLCseVEhD7d+RzIx1yecSMSdCp3S/mAvJsFuwBTZDCaOtKwTmu+DP6wIDAQAB";
export async function encryptNotionToken(token,publicKey=FINANCE_SYNC_PUBLIC_KEY){
 const key=await crypto.subtle.importKey("spki",unbase64(publicKey),{name:"RSA-OAEP",hash:"SHA-256"},false,["encrypt"]);
 const cipher=await crypto.subtle.encrypt({name:"RSA-OAEP"},key,new TextEncoder().encode(token));
 return {version:2,ciphertext:base64(new Uint8Array(cipher)),
  fingerprint:base64(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token))))};
}
export async function decryptNotionToken(encrypted,privateKey){
 if(encrypted?.version!==2||!encrypted.ciphertext)throw Error("Finance sync token not initialized");
 const key=await crypto.subtle.importKey("pkcs8",unbase64(privateKey),{name:"RSA-OAEP",hash:"SHA-256"},false,["decrypt"]);
 const plain=await crypto.subtle.decrypt({name:"RSA-OAEP"},key,unbase64(encrypted.ciphertext));
 return new TextDecoder().decode(plain);
}
export async function provisionSyncToken(env){
 if(!env.NOTION_API_TOKEN||!env.FINANCE_KV)return false;
 const current=await env.FINANCE_KV.get(encryptedTokenKey,"json");
 const hashed=base64(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(env.NOTION_API_TOKEN))));
 if(current?.version===2 && current.fingerprint===hashed)return true;
 const cipher=await encryptNotionToken(env.NOTION_API_TOKEN);
 await env.FINANCE_KV.put(encryptedTokenKey,JSON.stringify(cipher));
 return true;
}
