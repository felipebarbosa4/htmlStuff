// Shared finance helpers for Cloudflare Pages Functions.
// Never include banking credentials, actual household records or PINs in git.
const encoder=new TextEncoder(),decoder=new TextDecoder();
const baseHeaders={
 "content-type":"application/json; charset=utf-8",
 "cache-control":"private, no-store, max-age=0",
 "pragma":"no-cache",
 "x-content-type-options":"nosniff",
 "referrer-policy":"no-referrer",
 "x-frame-options":"DENY"
};
export function json(data,status=200,extra={}){return new Response(JSON.stringify(data),{status,headers:{...baseHeaders,...extra}});}
export function unavailable(env){return !env.FINANCE_KV||!/^\d{6}$/.test(String(env.FINANCE_PIN||''))||!env.FINANCE_SESSION_SECRET||String(env.FINANCE_SESSION_SECRET).length<32;}
export function sameOrigin(request){
 const origin=request.headers.get("origin");
 return !!origin && origin===new URL(request.url).origin
 && (request.headers.get("content-type")||"").split(";")[0].trim()==="application/json";
}
export async function requestJson(request,max=30000){
 if(Number(request.headers.get("content-length")||0)>max)throw Error("Request too large");
 const raw=await request.text();if(raw.length>max)throw Error("Request too large");
 return JSON.parse(raw);
}
function base64url(bytes){let b="";for(const v of bytes)b+=String.fromCharCode(v);return btoa(b).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");}
function unbase64url(s){const normalized=s.replace(/-/g,"+").replace(/_/g,"/");const b=atob(normalized+"=".repeat((4-normalized.length%4)%4));return Uint8Array.from(b,c=>c.charCodeAt(0));}
async function signKey(env){return crypto.subtle.importKey("raw",encoder.encode(env.FINANCE_SESSION_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);}
const cookieName=role=>role==="admin"?"finance_admin":"finance_view";
export function cookieClear(role){return cookieName(role)+"=; Path=/api/finance; HttpOnly; Secure; SameSite=Strict; Max-Age=0";}
export async function cookieFor(env,role,seconds){
 const exp=Date.now()+seconds*1000;
 const nonce=base64url(crypto.getRandomValues(new Uint8Array(16)));
 const body=base64url(encoder.encode(role+"|"+exp+"|"+nonce));
 const signature=base64url(new Uint8Array(await crypto.subtle.sign("HMAC",await signKey(env),encoder.encode(body))));
 return cookieName(role)+"="+body+"."+signature+"; Path=/api/finance; HttpOnly; Secure; SameSite=Strict; Max-Age="+seconds;
}
function cookieValue(request,name){const cookie=request.headers.get("cookie")||"";const entry=cookie.split(";").map(x=>x.trim()).find(x=>x.startsWith(name+"="));return entry?.slice(name.length+1)||"";}
export async function hasSession(request,env,role){
 try{
  const token=cookieValue(request,cookieName(role));
  if(!token||token.length>1000)return false;
  const pieces=token.split(".");if(pieces.length!==2)return false;
  const [body,mac]=pieces;
  if(!await crypto.subtle.verify("HMAC",await signKey(env),unbase64url(mac),encoder.encode(body)))return false;
  const [found,expiration]=decoder.decode(unbase64url(body)).split("|");
  return found===role && Number(expiration)>Date.now();
 }catch{return false;}
}
export async function canRead(request,env){return await hasSession(request,env,"view")||await hasSession(request,env,"admin");}
export async function secureEquals(a,b){
 const [x,y]=await Promise.all([crypto.subtle.digest("SHA-256",encoder.encode(String(a))),crypto.subtle.digest("SHA-256",encoder.encode(String(b)))]);
 const p=new Uint8Array(x),q=new Uint8Array(y);let diff=0;
 for(let i=0;i<p.length;i++)diff|=p[i]^q[i];
 return diff===0;
}
async function attemptsKey(request,env,role){
 const ip=request.headers.get("cf-connecting-ip")||"unknown";
 const digest=await crypto.subtle.digest("SHA-256",encoder.encode(role+"|"+env.FINANCE_SESSION_SECRET+"|"+ip));
 return "finance:attempts:"+base64url(new Uint8Array(digest));
}
export async function checkAttempt(request,env,role,valid){
 const key=await attemptsKey(request,env,role);
 const count=Number(await env.FINANCE_KV.get(key)||0);
 if(count>=5)return false;
 if(!valid)await env.FINANCE_KV.put(key,String(count+1),{expirationTtl:1800});
 else await env.FINANCE_KV.delete(key);
 return valid;
}
const categories=new Set(["essential","subscription","fee"]);
const frequencies=new Set(["monthly","biweekly","weekly","quarterly","yearly"]);
const statuses=new Set(["active","review","paused","cancelled"]);
export function normalizeItems(items){
 if(!Array.isArray(items)||items.length>100)throw Error("Maximum 100 expenses");
 const ids=new Set();
 return items.map(item=>{
  if(!item||typeof item!=="object"||Array.isArray(item))throw Error("Invalid item");
  const id=String(item.id||"").trim(),name=String(item.name||"").trim();
  if(!/^[a-zA-Z0-9_-]{3,80}$/.test(id)||ids.has(id))throw Error("Invalid or duplicated ID");
  ids.add(id);
  if(name.length<2||name.length>100)throw Error("Invalid expense name");
  const monthly=Number(item.monthlyBudget);
  if(!Number.isFinite(monthly)||monthly<0||monthly>1000000)throw Error("Invalid monthly budget");
  const category=String(item.category||"essential"),frequency=String(item.frequency||"monthly"),status=String(item.status||"review");
  if(!categories.has(category)||!frequencies.has(frequency)||!statuses.has(status))throw Error("Invalid category, frequency or status");
  const due=String(item.due||"").trim(),note=String(item.note||"").trim(),source=String(item.source||"").trim();
  if(due.length>60||note.length>500||source.length>300)throw Error("Invalid expense text");
  return {id,name,monthlyBudget:Math.round(monthly*100)/100,currency:"CAD",category,frequency,status,due,note,source,
    confirmed:item.confirmed===true};
 });
}
export const storageKey="finance:items:v1";
