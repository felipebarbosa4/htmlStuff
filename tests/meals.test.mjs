import test from 'node:test';
import assert from 'node:assert/strict';
import {STARTER_MEALS,cleanMeal} from '../functions/_meals.js';
import {onRequestGet,onRequestPost,onRequestPut,onRequestDelete} from '../functions/api/meals.js';

function context(){
 const m=new Map();const kv={async get(k,type){const x=m.get(k);return type==='json'&&x?JSON.parse(x):x||null;},async put(k,v){m.set(k,v);}};
 return {env:{MEALS_KV:kv},url:'https://example.org/api/meals'};
}
function request(c,method,payload,origin=c.url.replace('/api/meals','')){
 return {env:c.env,request:new Request(c.url,{method,headers:method==='GET'?{}:{Origin:origin,'content-type':'application/json'},body:payload?JSON.stringify(payload):undefined})};
}
const newMeal={name:'Arroz com frango',ingredients:['Arroz','Frango'],description:'Simples',minutes:20,image:''};
test('seed contains twelve editable Brazilian dishes',async()=>{
 const c=context();const r=await onRequestGet(request(c,'GET'));
 const j=await r.json();assert.equal(r.status,200);assert.equal(j.meals.length,12);
 assert.ok(j.meals.some(x=>x.name.includes('feijão')));
 assert.ok(j.meals.every(x=>Array.isArray(x.ingredients)&&x.ingredients.length));
});
test('create edit and remove sync across fresh independent reads',async()=>{
 const c=context();let r=await onRequestPost(request(c,'POST',newMeal));assert.equal(r.status,200);
 let j=await r.json();assert.equal(j.meals.length,13);const id=j.meals.at(-1).id;
 r=await onRequestGet(request(c,'GET'));j=await r.json();assert.equal(j.meals.at(-1).name,'Arroz com frango');
 r=await onRequestPut(request(c,'PUT',{...newMeal,id,name:'Arroz com ovo'}));j=await r.json();assert.equal(j.meals.find(x=>x.id===id).name,'Arroz com ovo');
 r=await onRequestDelete(request(c,'DELETE',{id}));j=await r.json();assert.equal(j.meals.length,12);
});
test('editing starter recipe and deleting it persists across sessions',async()=>{
 const c=context();const x=STARTER_MEALS[0];
 let r=await onRequestPut(request(c,'PUT',{...x,ingredients:['Frango','Arroz','Feijão'],name:'Nosso almoço'}));
 assert.equal(r.status,200);let j=await r.json();assert.equal(j.meals[0].name,'Nosso almoço');
 r=await onRequestDelete(request(c,'DELETE',{id:x.id}));assert.equal(r.status,200);
 j=await (await onRequestGet(request(c,'GET'))).json();assert.ok(!j.meals.some(y=>y.id===x.id));
});
test('CSRF reject and invalid image rejects all attempted changes',async()=>{
 const c=context();let r=await onRequestPost(request(c,'POST',newMeal,'https://evil.test'));assert.equal(r.status,403);
 r=await onRequestPost(request(c,'POST',{...newMeal,image:'javascript:alert(1)'}));assert.equal(r.status,400);
 const j=await (await onRequestGet(request(c,'GET'))).json();assert.equal(j.meals.length,12);
});
test('file photo accepts webp data URL, rejects SVG',()=>{
 assert.equal(cleanMeal({...newMeal,image:'data:image/webp;base64,AAAA'}).image,'data:image/webp;base64,AAAA');
 assert.throws(()=>cleanMeal({...newMeal,image:'data:image/svg+xml;base64,AAAA'}));
});
