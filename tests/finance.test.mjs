import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
 unavailable,normalizeItems,hasSession,cookieFor,sameOrigin,storageKey
} from '../functions/_finance.js';
import {onRequestPost as viewerLogin} from '../functions/api/finance/login.js';
import {onRequestPost as adminLogin} from '../functions/api/finance/admin-login.js';
import {onRequestGet,onRequestPut} from '../functions/api/finance/expenses.js';
import {onRequestPost as logout} from '../functions/api/finance/logout.js';

const ORIGIN='https://finance.example.org';
const PIN='000000'; // synthetic test value, NOT a real deployment PIN
const sessionSecret='test-key-'.repeat(10);
class MemoryKV {
 constructor(){this.data=new Map();}
 async get(key,type){const value=this.data.get(key);return type==='json'&&value?JSON.parse(value):value??null;}
 async put(key,value){this.data.set(key,value);}
 async delete(key){this.data.delete(key);}
}
function env(){return {FINANCE_PIN:PIN,FINANCE_SESSION_SECRET:sessionSecret,FINANCE_KV:new MemoryKV()};}
function post(path,data,cookie='',origin=ORIGIN){
 return new Request(ORIGIN+path,{method:'POST',headers:{'content-type':'application/json','origin':origin,...(cookie?{cookie}:{})},body:JSON.stringify(data)});
}
function put(path,data,cookie=''){return new Request(ORIGIN+path,{method:'PUT',headers:{'content-type':'application/json',origin:ORIGIN,cookie},body:JSON.stringify(data)});}
function get(path,cookie=''){return new Request(ORIGIN+path,{headers:{cookie}});}
function sessionCookie(response){return response.headers.get('set-cookie').split(';')[0];}
const sample={id:'expense_1',name:'Synthetic test expense',monthlyBudget:42.14,category:'subscription',frequency:'monthly',status:'review',due:'1st',note:'testing',source:'synthetic',confirmed:false};

test('unconfigured finance always fails closed',async()=>{
 assert.equal(unavailable({}),true);
 const e=env();assert.equal(unavailable(e),false);
 const r=await onRequestGet({request:get('/api/finance/expenses'),env:{}});
 assert.equal(r.status,503);
});
test('invalid request origins rejected before authentication',async()=>{
 const e=env();
 const r=await viewerLogin({request:post('/api/finance/login',{pin:PIN},'','https://attacker.test'),env:e});
 assert.equal(r.status,403);
 assert.equal(sameOrigin(post('/api/finance/login',{pin:PIN},'',ORIGIN)),true);
});
test('viewer auth only grants viewer GET and not PUT',async()=>{
 const e=env();
 const no=await onRequestGet({request:get('/api/finance/expenses'),env:e});assert.equal(no.status,401);
 const bad=await viewerLogin({request:post('/api/finance/login',{pin:'999999'}),env:e});
 assert.equal(bad.status,401);
 const good=await viewerLogin({request:post('/api/finance/login',{pin:PIN}),env:e});
 assert.equal(good.status,200);
 const cookie=sessionCookie(good);assert.ok(cookie.startsWith('finance_view='));
 assert.match(good.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
 const read=await onRequestGet({request:get('/api/finance/expenses',cookie),env:e});
 assert.equal(read.status,200);
 assert.deepEqual((await read.json()).items,[]);
 const blocked=await onRequestPut({request:put('/api/finance/expenses',{items:[sample]},cookie),env:e});
 assert.equal(blocked.status,403);
});
test('same PIN gives separate server-signed administrator session',async()=>{
 const e=env();
 const response=await adminLogin({request:post('/api/finance/admin-login',{password:PIN}),env:e});
 assert.equal(response.status,200);
 const cookie=sessionCookie(response);
 assert.ok(cookie.startsWith('finance_admin='));
 const save=await onRequestPut({request:put('/api/finance/expenses',{items:[sample]},cookie),env:e});
 assert.equal(save.status,200);
 assert.equal((await save.json()).count,1);
 assert.ok(e.FINANCE_KV.data.has(storageKey));
 const read=await onRequestGet({request:get('/api/finance/expenses',cookie),env:e});
 assert.deepEqual((await read.json()).items[0].name,sample.name);
});
test('failed PIN attempts are limited and correct PIN is blocked after five failures',async()=>{
 const e=env();
 for(let i=0;i<5;i++)assert.equal((await viewerLogin({request:post('/api/finance/login',{pin:'999999'}),env:e})).status,401);
 assert.equal((await viewerLogin({request:post('/api/finance/login',{pin:PIN}),env:e})).status,401);
});
test('signed session integrity checks and logout clears cookies',async()=>{
 const e=env(),original=await cookieFor(e,'view',180);
 assert.equal(await hasSession(get('/api/finance/expenses',original.split(';')[0]),e,'view'),true);
 const cookie=original.split(';')[0];
 const tampered=cookie.slice(0,-2)+'AA';
 assert.equal(await hasSession(get('/api/finance/expenses',tampered),e,'view'),false);
 const out=await logout({request:post('/api/finance/logout',{}),env:e});
 assert.equal(out.status,200);
 assert.match(out.headers.get('set-cookie'),/Max-Age=0/);
});
test('records validated and duplicate IDs rejected',()=>{
 assert.deepEqual(normalizeItems([sample])[0].monthlyBudget,42.14);
 assert.throws(()=>normalizeItems([sample,sample]),/duplicated/i);
 assert.throws(()=>normalizeItems([{...sample,name:''}]),/Invalid/);
 assert.throws(()=>normalizeItems([{...sample,monthlyBudget:-1}]),/Invalid/);
 assert.throws(()=>normalizeItems([{...sample,category:'credential'}]),/Invalid/);
});
test('kiosk schedule unchanged and finance never an automatic mode',async()=>{
 const html=await readFile(new URL('../family-dashboard/index.html',import.meta.url),'utf8');
 const body=html.match(/function which\(p\)\{([^}]*)\}/)?.[1];
 assert.ok(body,'scheduler function exists');
 const determine=new Function('p',body);
 for(const [hour,minute,result] of [[0,0,'night'],[5,59,'night'],[6,0,'calendar'],[7,59,'calendar'],[8,0,'weather'],[8,49,'weather'],[8,50,'calendar'],[21,59,'calendar'],[22,0,'night']]){
   assert.equal(determine({hour,minute}),result,`at ${hour}:${minute}`);
 }
 assert.ok(html.includes('data-mode="finance"'));
 // Cloudflare Pages serves a copy of index.html at / but JS/CSS live in /family-dashboard/.
 // Relative finance.js and finance.css paths leave the entire kiosk stage blank.
 assert.ok(html.includes('src="/family-dashboard/finance.js"'));
 assert.ok(html.includes('href="/family-dashboard/finance.css"'));
 assert.ok(!html.includes('finance-admin/'));
 assert.ok(!html.includes('378912'));
});
