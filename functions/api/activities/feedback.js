import {json} from '../activities/shared.js';
import {FEEDBACK_KEY,MODES,preferencesFrom,validOrigin} from './config.js';

// Per-household feedback: only Google place IDs and self-declared preferences.
export async function onRequestGet({env}) {
  if(!env.ACTIVITIES_KV)return json({records:[]});
  try{return json({records:preferencesFrom(await env.ACTIVITIES_KV.get(FEEDBACK_KEY,'json'))});}
  catch{return json({records:[]});}
}
export async function onRequestPost({request,env}) {
  if(!validOrigin(request))return json({error:'Same-origin dashboard request required'},403);
  if(!env.ACTIVITIES_KV)return json({error:'Preferences storage is unavailable'},503);
  try{
    const v=await request.json();
    if(!v || !MODES.includes(v.mode)||typeof v.id!=='string'||
       v.id.length>200||!/^[A-Za-z0-9_:-]+$/.test(v.id)||
       typeof v.category!=='string'||v.category.length>35||!/^[a-z]+$/.test(v.category)||
       !['like','dislike','visited'].includes(v.value))
      return json({error:'Invalid feedback'},400);
    const saved=preferencesFrom(await env.ACTIVITIES_KV.get(FEEDBACK_KEY,'json'));
    // One latest feedback per mode+place, with no personal identifiers.
    const records=[...saved.filter(x=>x.id!==v.id||x.mode!==v.mode),
      {mode:v.mode,id:v.id,category:v.category,value:v.value,updatedAt:new Date().toISOString()}].slice(-200);
    await env.ACTIVITIES_KV.put(FEEDBACK_KEY,JSON.stringify({records}));
    return json({records});
  }catch{return json({error:'Could not store preference'},502);}
}
