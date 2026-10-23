// One short WAV segment per request. Cloudflare Access protects /api/*.
const json=(body,status=200)=>new Response(JSON.stringify(body),{
 status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
});
export function allowedAudioRequest(request){
 const u=new URL(request.url);
 return request.headers.get('origin')===u.origin &&
   (!request.headers.get('sec-fetch-site')||request.headers.get('sec-fetch-site')==='same-origin');
}
export async function onRequestPost({request,env}){
 if(!allowedAudioRequest(request))return json({error:'Origem não autorizada.'},403);
 if(!env.OPENAI_API_KEY||!env.ACTIVITIES_KV)
  return json({error:'A transcrição precisa de OPENAI_API_KEY e ACTIVITIES_KV no Cloudflare.'},503);
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data'))
  return json({error:'Áudio multipart obrigatório.'},415);
 const limit=500000;
 if(Number(request.headers.get('content-length')||0)>limit+4096)
  return json({error:'Trecho de áudio muito longo.'},413);
 let file;
 try{
  const data=await request.formData();
  file=data.get('audio');
 }catch{return json({error:'Áudio inválido.'},400);}
 if(!file||typeof file.arrayBuffer!=='function'||file.size<5000||file.size>limit)
  return json({error:'Áudio vazio ou muito longo.'},400);
 const head=new Uint8Array(await file.slice(0,12).arrayBuffer());
 if(String.fromCharCode(...head.slice(0,4))!=='RIFF'||
    String.fromCharCode(...head.slice(8,12))!=='WAVE')
  return json({error:'Envie áudio WAV válido.'},400);
 // KV rate limits are approximate across regions, not a billing hard cap.
 const ip=request.headers.get('cf-connecting-ip')||'unknown';
 const day=new Date().toISOString().slice(0,10);
 const minute=Math.floor(Date.now()/60000);
 const dailyKey='family-voice-stt:day:'+day+':'+ip;
 const minuteKey='family-voice-stt:minute:'+minute+':'+ip;
 try{
  const values=await Promise.all([env.ACTIVITIES_KV.get(dailyKey),env.ACTIVITIES_KV.get(minuteKey)]);
  if(Number(values[0]||0)>=120)return json({error:'Limite diário de áudio atingido. Desative o microfone.'},429);
  if(Number(values[1]||0)>=6)return json({error:'Muitas falas em sequência. Tente mais tarde.'},429);
  await Promise.all([
   env.ACTIVITIES_KV.put(dailyKey,String(Number(values[0]||0)+1),{expirationTtl:90000}),
   env.ACTIVITIES_KV.put(minuteKey,String(Number(values[1]||0)+1),{expirationTtl:120})
  ]);
 }catch{return json({error:'Limite de segurança indisponível.'},503);}
 const form=new FormData();
 form.append('model','gpt-transcribe');
 form.append('file',file,'speech.wav');
 form.append('languages[]','pt');
 form.append('keywords[]','Hey Family');
 form.append('keywords[]','Ei família');
 form.append('prompt','Uma pessoa falando português brasileiro para o assistente Hey Family. Transcreva somente o que foi realmente dito.');
 const abort=new AbortController();
 const timer=setTimeout(()=>abort.abort(),16000);
 try{
  const r=await fetch('https://api.openai.com/v1/audio/transcriptions',{
   method:'POST',signal:abort.signal,
   headers:{'Authorization':'Bearer '+env.OPENAI_API_KEY},
   body:form
  });
  if(!r.ok)return json({error:'Serviço de transcrição indisponível. Código '+r.status+'.'},503);
  const result=await r.json();
  return json({text:String(result.text||'').slice(0,360)});
 }catch{return json({error:'Não foi possível transcrever o áudio agora.'},503);}
 finally{clearTimeout(timer);}
}
