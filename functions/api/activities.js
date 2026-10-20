import {CACHE_KEY,json} from './activities/shared.js';
export async function onRequestGet({env}) {
  if(!env.ACTIVITIES_KV)return json({error:'Activities storage is not configured.'},503);
  try{
    const saved=await env.ACTIVITIES_KV.get(CACHE_KEY,'json');
    return json(saved||{items:[],generatedAt:null,provider:null,date:null});
  }catch{return json({error:'Could not read saved activities.'},502);}
}