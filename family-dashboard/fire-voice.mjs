// Browser microphone fallback for Fire OS / Android WebView with missing Google STT.
// Uses simple on-device volume gating (NOT offline speech or wake detection).
// Short detected segments are sent to private Cloudflare STT only after user activation.
export function isLikelyFireKiosk(userAgent){
 return /\b(?:kindle|silk|fire\s?os|KF[A-Z0-9]{3,}|fully\s?kiosk)\b/i.test(String(userAgent||''));
}
export function encodeWav(samples,sampleRate){
 if(!samples?.length||!(sampleRate>0))throw Error('Audio vazio.');
 const ratio=sampleRate/16000;
 const n=Math.floor(samples.length/ratio);
 const buf=new ArrayBuffer(44+n*2);
 const view=new DataView(buf);
 const str=(offset,s)=>{for(let i=0;i<s.length;i++)view.setUint8(offset+i,s.charCodeAt(i));};
 str(0,'RIFF');view.setUint32(4,36+n*2,true);str(8,'WAVE');str(12,'fmt ');
 view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
 view.setUint32(24,16000,true);view.setUint32(28,32000,true);
 view.setUint16(32,2,true);view.setUint16(34,16,true);
 str(36,'data');view.setUint32(40,n*2,true);
 for(let i=0;i<n;i++){
  const start=Math.floor(i*ratio),end=Math.max(start+1,Math.floor((i+1)*ratio));
  let sum=0;
  for(let j=start;j<Math.min(end,samples.length);j++)sum+=samples[j];
  const value=Math.max(-1,Math.min(1,sum/Math.max(1,Math.min(end,samples.length)-start)));
  view.setInt16(44+i*2,Math.round(value*(value<0?32768:32767)),true);
 }
 return new Blob([buf],{type:'audio/wav'});
}

export function createFireAudio({onTranscript,onError,onInfo}){
 let context=null,stream=null,source=null,processor=null;
 let enabled=false,paused=false,inflight=false,failures=0,clips=0;
 let speaking=false,chunks=[],frames=0,silentFrames=0,ring=[],ringFrames=0;
 let minSilence=0,aborter=null,sampleRate=48000,noise=0.004;
 function reset(){speaking=false;chunks=[];frames=0;silentFrames=0;ring=[];ringFrames=0;}
 function pause(yes){paused=Boolean(yes);reset();}
 function stop(){
  enabled=false;paused=true;reset();
  aborter?.abort();aborter=null;
  if(processor){try{processor.disconnect();}catch{}processor.onaudioprocess=null;processor=null;}
  if(source){try{source.disconnect();}catch{}source=null;}
  if(stream){for(const track of stream.getTracks())track.stop();stream=null;}
  if(context){context.close().catch(()=>{});context=null;}
 }
 async function send(samples){
  if(!enabled||inflight||clips>=120)return;
  inflight=true;clips++;
  const ctrl=new AbortController();aborter=ctrl;
  try{
   const blob=encodeWav(samples,sampleRate);
   if(blob.size>500000)throw Error('Áudio excedeu o tamanho permitido.');
   const form=new FormData();form.append('audio',blob,'speech.wav');
   const timeout=setTimeout(()=>ctrl.abort(),18000);
   let response;
   try{
    response=await fetch('/api/voice/transcribe',{
     method:'POST',body:form,credentials:'same-origin',cache:'no-store',signal:ctrl.signal
    });
   }finally{clearTimeout(timeout);}
   if(response.type==='opaqueredirect'||!response.headers.get('content-type')?.includes('application/json'))
    throw Error('Sessão Cloudflare expirada. Reabra o dashboard.');
   const data=await response.json();
   if(!response.ok)throw Error(data.error||'Transcrição indisponível.');
   failures=0;
   const text=String(data.text||'').trim();
   if(enabled&&text)onTranscript(text);
  }catch(error){
   if(!enabled||error.name==='AbortError')return;
   failures++;
   if(failures>=3||/limite|sessão|chave|configura|indisponível/i.test(error.message))
    onError('Áudio online: '+String(error.message||'erro na transcrição'));
  }finally{
   inflight=false;
   if(aborter===ctrl)aborter=null;
  }
 }
 function receive(event){
  if(!enabled||paused||inflight||!context)return;
  const mono=event.inputBuffer.getChannelData(0);
  const pcm=new Float32Array(mono);
  let sum=0;for(let i=0;i<pcm.length;i++)sum+=pcm[i]*pcm[i];
  const rms=Math.sqrt(sum/pcm.length);
  const threshold=Math.max(0.020,Math.min(0.1,noise*3.5));
  if(!speaking){
   if(rms<threshold)noise=noise*0.996+rms*0.004;
   ring.push(pcm);ringFrames+=pcm.length;
   while(ringFrames>sampleRate*0.35 && ring.length>1)ringFrames-=ring.shift().length;
   if(rms>threshold){
    speaking=true;chunks=ring.slice();frames=ringFrames;silentFrames=0;
    ring=[];ringFrames=0;
   }
   return;
  }
  chunks.push(pcm);frames+=pcm.length;
  if(rms<threshold*.6)silentFrames+=pcm.length;
  else silentFrames=0;
  if(frames>sampleRate*.55 && (silentFrames>minSilence || frames>=sampleRate*5.5)){
   // Treat 1+ seconds as speech and avoid transcribing accidental taps.
   const capturedFrames=frames;
   const captured=chunks;
   reset();
   if(capturedFrames<sampleRate*.85)return;
   const array=new Float32Array(capturedFrames);
   let offset=0;for(const chunk of captured){array.set(chunk,offset);offset+=chunk.length;}
   send(array);
  }
 }
 async function start(){
  if(enabled)return;
  if(!navigator.mediaDevices?.getUserMedia)
   throw Error('O Fully Kiosk não disponibiliza getUserMedia. Verifique Enable Microphone Access no Fully.');
  const AudioEngine=window.AudioContext||window.webkitAudioContext;
  if(!AudioEngine)throw Error('Web Audio indisponível neste navegador.');
  // Starts exclusively from a deliberate tap in the dashboard.
  stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
  try{
   context=new AudioEngine();
   sampleRate=context.sampleRate;
   source=context.createMediaStreamSource(stream);
   if(typeof context.createScriptProcessor!=='function')throw Error('O WebView não suporta captura de áudio PCM.');
   processor=context.createScriptProcessor(2048,1,1);
   processor.onaudioprocess=receive;
   source.connect(processor);
   processor.connect(context.destination);
   await context.resume();
   minSilence=Math.floor(sampleRate*.72);
   enabled=true;paused=false;failures=0;reset();
   onInfo?.('Modo Fire: escutando. Trechos com voz serão enviados à OpenAI para transcrição (serviço pago).');
  }catch(error){stop();throw error;}
 }
 return {start,stop,pause,get active(){return enabled;}};
}
