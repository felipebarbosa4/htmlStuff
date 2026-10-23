// Optional generated voice for Fire OS when a local Brazilian TTS engine is absent.
const json=(body,status=400)=>new Response(JSON.stringify(body),{
 status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
});
export async function onRequestPost({request,env}){
 const url=new URL(request.url);
 if(request.headers.get('origin')!==url.origin ||
   (request.headers.get('sec-fetch-site')&&request.headers.get('sec-fetch-site')!=='same-origin'))
  return json({error:'Origem não autorizada.'},403);
 if(!request.headers.get('content-type')?.startsWith('application/json'))
  return json({error:'JSON obrigatório.'},415);
 if(Number(request.headers.get('content-length')||0)>1200)
  return json({error:'Texto muito longo.'},413);
 if(!env.OPENAI_API_KEY||!env.ACTIVITIES_KV)
  return json({error:'TTS não configurado no Cloudflare.'},503);
 let body;
 try{body=await request.text();if(body.length>1200)return json({error:'Texto muito longo.'},413);body=JSON.parse(body);}
 catch{return json({error:'Texto inválido.'},400);}
 const text=typeof body?.text==='string'?body.text.trim():'';
 if(text.length<2||text.length>850)return json({error:'Texto precisa ter entre 2 e 850 caracteres.'},400);
 const ip=request.headers.get('cf-connecting-ip')||'unknown';
 const day=new Date().toISOString().slice(0,10);
 const hour=Math.floor(Date.now()/3600000);
 const keys=['family-voice-tts:day:'+day+':'+ip,'family-voice-tts:hour:'+hour+':'+ip];
 try{
  const totals=await Promise.all(keys.map(k=>env.ACTIVITIES_KV.get(k)));
  if(Number(totals[0]||0)>=120||Number(totals[1]||0)>=30)
   return json({error:'Limite de resposta falada atingido.'},429);
  await Promise.all(keys.map((k,i)=>env.ACTIVITIES_KV.put(k,String(Number(totals[i]||0)+1),{expirationTtl:i===0?90000:7200})));
 }catch{return json({error:'Controle de uso do TTS indisponível.'},503);}
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),18000);
 try{
  const response=await fetch('https://api.openai.com/v1/audio/speech',{
   method:'POST',signal:controller.signal,
   headers:{'authorization':'Bearer '+env.OPENAI_API_KEY,'content-type':'application/json'},
   body:JSON.stringify({model:'gpt-4o-mini-tts',voice:'coral',input:text,
    instructions:'Fale em português brasileiro com pronúncia natural, tom acolhedor e ritmo claro para uma família.',
    response_format:'mp3'})
  });
  if(!response.ok)return json({error:'TTS online indisponível.'},503);
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength<1000||bytes.byteLength>2500000)return json({error:'Áudio de resposta inválido.'},503);
  return new Response(bytes,{status:200,headers:{'content-type':'audio/mpeg','cache-control':'no-store'}});
 }catch{return json({error:'Falha ao produzir a resposta falada.'},503);}
 finally{clearTimeout(timer);}
}
