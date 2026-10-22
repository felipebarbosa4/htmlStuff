import {baseList,cleanMeal,MAX_MEALS,STORAGE_KEY} from '../_meals.js';
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});}
function sameOrigin(request){
 const url=new URL(request.url);
 const origin=request.headers.get('origin');
 const site=request.headers.get('sec-fetch-site');
 return origin===url.origin && (!site||site==='same-origin');
}
async function catalog(env){
 if(!env.MEALS_KV)throw new Error('Armazenamento de refeições ainda não configurado.');
 const data=await env.MEALS_KV.get(STORAGE_KEY,'json');
 if(data&&Array.isArray(data.meals))return {meals:data.meals,updatedAt:data.updatedAt||null};
 return {meals:baseList(),updatedAt:null};
}
async function readBody(request){
 const text=await request.text();
 if(text.length>200000)throw new Error('A foto é grande demais. Tente outra menor.');
 try{return JSON.parse(text);}catch{throw new Error('Dados inválidos.');}
}
async function update(context,op){
 if(!sameOrigin(context.request))return json({error:'Acesso de edição permitido somente pelo próprio site.'},403);
 const {env,request}=context;
 if(!env.MEALS_KV)return json({error:'Armazenamento de refeições não configurado.'},503);
 try{
  const body=await readBody(request);
  const previous=await catalog(env);const meals=previous.meals.slice();
  if(op==='create'){
   if(meals.length>=MAX_MEALS)return json({error:'Limite de refeições atingido.'},400);
   const meal=cleanMeal(body);
   meals.push({...meal,id:crypto.randomUUID()});
  } else {
   const id=String(body.id||'');const ix=meals.findIndex(m=>m.id===id);
   if(ix<0)return json({error:'Refeição não encontrada. Atualize a lista.'},404);
   if(op==='delete')meals.splice(ix,1);
   else meals[ix]={...cleanMeal(body),id};
  }
  const data={meals,updatedAt:new Date().toISOString()};
  await env.MEALS_KV.put(STORAGE_KEY,JSON.stringify(data));
  return json(data);
 }catch(error){
  return json({error:error?.message||'Não foi possível salvar.'},400);
 }
}
export async function onRequestGet({env}){
 try{return json(await catalog(env));}
 catch{return json({error:'Não foi possível carregar as refeições.'},503);}
}
export const onRequestPost=context=>update(context,'create');
export const onRequestPut=context=>update(context,'edit');
export const onRequestDelete=context=>update(context,'delete');
