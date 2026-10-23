import {extractWakePhrase,localIntent,nextAgenda} from './voice-core.mjs';
import {createFireAudio,isLikelyFireKiosk} from './fire-voice.mjs';

// Browsers require an initial user tap to grant microphone access. The wake phrase
// is transcribed by Chrome's Web Speech API, not a custom offline wake-word engine.
const SpeechAPI=window.SpeechRecognition||window.webkitSpeechRecognition;
const synth=window.speechSynthesis;
const root=document.createElement('aside');
root.className='family-voice';
root.setAttribute('aria-label','Assistente de voz da família');
root.innerHTML='<div class="family-voice-message" role="status" aria-live="polite" hidden><strong>Hey Family</strong><span class="family-voice-detail"></span><button type="button" class="family-voice-cloud-consent" hidden>Ativar voz online (pago)</button></div>'+
 '<button type="button" class="family-voice-toggle" aria-label="Ativar assistente de voz" aria-pressed="false" title="Ativar Hey Family">🎙️</button>';
document.body.appendChild(root);
const toggle=root.querySelector('button');
const message=root.querySelector('.family-voice-message');
const detail=root.querySelector('.family-voice-detail');
const approve=root.querySelector('.family-voice-cloud-consent');
const CLOUD_CONSENT_KEY='family-dashboard:voice-cloud-ok';
let cloudApproved=false;
try{cloudApproved=sessionStorage.getItem(CLOUD_CONSENT_KEY)==='yes';}catch{}

let enabled=false, mode='off', listening=false, instance=null;
let restartTimer=null, commandTimer=null, messageTimer=null, requestController=null;
let retryCount=0,shortEnds=0,startedAt=0,heardResult=false;
let channel=isLikelyFireKiosk(navigator.userAgent)?'cloud':'webspeech';
let fireAudio=null,ttsAbort=null,sound=null,soundUrl=null;
const STORE_KEY='family-dashboard:voice-consent-session';
function persist(yes){try{if(yes)sessionStorage.setItem(STORE_KEY,'1');else sessionStorage.removeItem(STORE_KEY);}catch{}}
const NAMES={calendar:'calendário',weather:'roupas',activities:'What to Do',waste:'coleta',
 meals:'refeições',night:'modo noturno',auto:'modo automático'};

function display(text,persist=false){
 clearTimeout(messageTimer);
 detail.textContent=String(text||'').slice(0,420);
 message.hidden=false;
 if(!persist)messageTimer=setTimeout(()=>{message.hidden=true;},7000);
}
function visual(){
 toggle.dataset.state=mode;
 toggle.setAttribute('aria-pressed',String(enabled));
 toggle.setAttribute('aria-label',enabled?'Desativar Hey Family':'Ativar Hey Family');
 toggle.title=enabled?'Desativar microfone':'Ativar Hey Family';
 toggle.textContent=enabled?(mode==='busy'?'⏳':mode==='speaking'?'🔊':'🎙️'):'🎙️';
}
function clearTimers(){clearTimeout(restartTimer);clearTimeout(commandTimer);}
function halt(){
 clearTimeout(restartTimer);
 fireAudio?.pause(true);
 const current=instance;
 instance=null;listening=false;
 if(current){try{current.abort();}catch{/* browser already stopped */}}
}
function disable(reason){
 enabled=false;mode='off';persist(false);clearTimers();
 requestController?.abort();requestController=null;
 halt();
 fireAudio?.stop();fireAudio=null;
 synth?.cancel();
 ttsAbort?.abort();ttsAbort=null;
 if(sound){sound.pause();sound=null;}
 if(soundUrl){URL.revokeObjectURL(soundUrl);soundUrl=null;}
 retryCount=0;
 visual();
 approve.hidden=true;message.classList.remove('cloud-approval');
 if(reason)display(reason,true);
 else {message.hidden=true;clearTimeout(messageTimer);}
}
function scheduleListen(delay=350){
 clearTimeout(restartTimer);
 if(!enabled||document.hidden||!['wake','command'].includes(mode))return;
 restartTimer=setTimeout(beginListening,delay);
}
function beginListening(){
 if(!enabled||document.hidden||listening||!['wake','command'].includes(mode))return;
 if(channel==='cloud'){
  fireAudio?.pause(false);
  if(mode==='command'){
   clearTimeout(commandTimer);
   commandTimer=setTimeout(()=>{
    if(enabled&&mode==='command'){
     mode='wake';visual();halt();
     say('Não ouvi sua pergunta. Diga Hey Family para tentar novamente.');
    }
   },11000);
  }
  return;
 }
 if(!SpeechAPI){disable('Este Chrome não oferece reconhecimento de voz.');return;}
 try{
  const rec=new SpeechAPI();
  instance=rec;
  rec.lang='pt-BR';rec.continuous=true;rec.interimResults=false;rec.maxAlternatives=1;
  rec.onstart=()=>{
   startedAt=Date.now();heardResult=false;
   if(!enabled||instance!==rec){try{rec.abort();}catch{}return;}
   listening=true;
   if(mode==='command'){
    clearTimeout(commandTimer);
    commandTimer=setTimeout(()=>{
     if(mode==='command'){mode='wake';visual();halt();say('Não ouvi sua pergunta. Pode tentar novamente dizendo Hey Family.');}
    },11000);
   }
  };
  rec.onresult=(event)=>{
   if(!enabled||instance!==rec||!['wake','command'].includes(mode))return;
   for(let i=event.resultIndex;i<event.results.length;i++){
    if(!event.results[i].isFinal)continue;
    const transcript=String(event.results[i][0]?.transcript||'').trim();
    retryCount=0;shortEnds=0;heardResult=true;
    handleTranscript(transcript);
   }
  };
  rec.onerror=event=>{
   if(instance!==rec||!enabled)return;
   const code=String(event.error||'');
   if(code==='service-not-allowed'||code==='language-not-supported'||code==='network'){
    switchToCloud();return;
   }
   if(code==='not-allowed'||code==='audio-capture'){
    disable('Microfone bloqueado. Permita o acesso ao Fully Kiosk nas configurações do Fire.');return;
   }
   if(code==='no-speech'||code==='aborted')return;
   retryCount++;
   if(retryCount>=4){switchToCloud();return;}
   display('Reconectando o reconhecimento de voz…');
  };
  rec.onend=()=>{
   if(instance!==rec)return;
   listening=false;instance=null;
   if(enabled&&['wake','command'].includes(mode)){
    if(!heardResult&&startedAt&&Date.now()-startedAt<1800)shortEnds++;
    else shortEnds=0;
    if(shortEnds>=3){switchToCloud();return;}
    scheduleListen(retryCount?Math.min(4000,retryCount*900):300);
   }
  };
  // Never initiate permission prompts on load: only after the user enables the mic.
  rec.start();
 }catch{
  retryCount++;
  if(retryCount>=4)switchToCloud();
  else scheduleListen(Math.min(3000,retryCount*700));
 }
}
function handleTranscript(transcript){
 if(!enabled||!['wake','command'].includes(mode)||!transcript)return;
 if(mode==='wake'){
  const remainder=extractWakePhrase(transcript);
  if(remainder===null)return; // Ignore everything else.
  clearTimeout(commandTimer);
  if(remainder){processQuestion(remainder);return;}
  mode='command';visual();halt();
  say('Oi, pode perguntar.', 'command');
  return;
 }
 if(mode==='command')processQuestion(transcript);
}
function promptCloud(){
 approve.hidden=false;message.classList.add('cloud-approval');
 display('O Google Speech não está disponível. Modo Fire: trechos com voz serão enviados à OpenAI para transcrição, com custo por uso. Autorize abaixo.',true);
}
async function switchToCloud(){
 if(!enabled||channel==='cloud')return;
 channel='cloud';shortEnds=0;
 halt();
 if(!cloudApproved){
  disable();
  promptCloud();
  return;
 }
 display('Google Speech ausente. Tentando modo Fire, com transcrição online.',true);
 try{await startCloud();}catch(error){
  disable('Modo Fire indisponível: '+error.message);
 }
}
async function startCloud(){
 if(!fireAudio)fireAudio=createFireAudio({
  onTranscript:handleTranscript,
  onError:message=>disable(message),
  onInfo:message=>display(message,true)
 });
 await fireAudio.start();
 if(!enabled){fireAudio.stop();return;}
 mode='wake';visual();fireAudio.pause(false);
}

function finishSpeaking(next){
 if(enabled&&mode==='speaking'){mode=next;visual();scheduleListen(400);}
}
function speakLocal(answer,next){
 if(!synth||!window.SpeechSynthesisUtterance){
  display('A resposta está na tela, mas o Fire não conseguiu reproduzir áudio. Verifique o TTS/Autoplay no Fully Kiosk.',true);
  finishSpeaking(next);return;
 }
 try{
  synth.cancel();
  const u=new SpeechSynthesisUtterance(answer);
  u.lang='pt-BR';u.rate=1;u.pitch=1;
  const voices=synth.getVoices();
  const preferred=voices.find(v=>v.lang.toLowerCase()==='pt-br')||
   voices.find(v=>v.lang.toLowerCase().startsWith('pt'));
  if(preferred)u.voice=preferred;
  let completed=false;
  const finish=()=>{
   if(completed)return;completed=true;clearTimeout(watchdog);
   finishSpeaking(next);
  };
  const watchdog=setTimeout(()=>{if(!completed){synth.cancel();finish();}},15000);
  u.onend=finish;u.onerror=finish;
  synth.speak(u);
 }catch{finishSpeaking(next);}
}
async function speakCloud(answer,next){
 const ctrl=new AbortController();
 ttsAbort=ctrl;
 const timeout=setTimeout(()=>ctrl.abort(),20000);
 try{
  const response=await fetch('/api/voice/speak',{
   method:'POST',credentials:'same-origin',cache:'no-store',signal:ctrl.signal,
   headers:{'content-type':'application/json'},body:JSON.stringify({text:answer})
  });
  if(!enabled||mode!=='speaking')return;
  if(!response.ok||!response.headers.get('content-type')?.startsWith('audio/'))
   throw Error('Áudio de resposta indisponível.');
  const blob=await response.blob();
  soundUrl=URL.createObjectURL(blob);
  sound=new Audio(soundUrl);
  let finished=false;
  const cleanup=()=>{
   sound?.pause();sound=null;
   if(soundUrl){URL.revokeObjectURL(soundUrl);soundUrl=null;}
  };
  const done=()=>{
   if(finished)return;
   finished=true;clearTimeout(playbackWatchdog);
   cleanup();finishSpeaking(next);
  };
  const failed=()=>{
   if(finished)return;
   finished=true;clearTimeout(playbackWatchdog);
   cleanup();
   if(enabled&&mode==='speaking')speakLocal(answer,next);
  };
  const playbackWatchdog=setTimeout(done,40000);
  sound.onended=done;sound.onerror=failed;
  try{await sound.play();}catch{failed();}
 }catch{
  if(enabled&&mode==='speaking')speakLocal(answer,next);
 }finally{
  clearTimeout(timeout);
  if(ttsAbort===ctrl)ttsAbort=null;
 }
}
function say(text,next='wake'){
 const answer=String(text||'').slice(0,850);
 display(answer);
 if(!enabled)return;
 mode='speaking';visual();clearTimeout(commandTimer);halt();
 if(channel==='cloud'){
  // Native TTS is often unavailable on Fire tablets without Google services.
  speakCloud(answer,next);return;
 }
 speakLocal(answer,next);
}
function timeAnswer(dateOnly){
 const date=new Date();
 return dateOnly?
  'Hoje é '+new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Toronto',weekday:'long',day:'numeric',month:'long'}).format(date)+'.':
  'Agora são '+new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Toronto',hour:'2-digit',minute:'2-digit'}).format(date)+', em Ottawa.';
}
function agendaAnswer(){
 const dashboard=window.familyDashboardVoice;
 const events=dashboard?.upcoming?.();
 if(events===null||events===undefined){
  dashboard?.showScreen?.('calendar');
  return 'Abri seu calendário. Os compromissos vão aparecer na tela quando a sincronização terminar.';
 }
 const next=nextAgenda(events);
 if(!next.length)return 'Não encontrei compromissos futuros entre os eventos carregados.';
 const first=next[0];
 return 'Seu próximo compromisso é '+first.title+', '+
  new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Toronto',weekday:'long',hour:'2-digit',minute:'2-digit'}).format(new Date(first.start))+'.';
}
async function processQuestion(text){
 if(!enabled)return;
 mode='busy';visual();clearTimeout(commandTimer);halt();
 const input=String(text).trim().slice(0,280);
 display('Você: '+input,true);
 const intent=localIntent(input);
 if(intent.type==='empty'){say('Não ouvi sua pergunta.');return;}
 if(intent.type==='restricted'){say('Por segurança, não consulto nem desbloqueio informações financeiras por voz. Use a aba Finance e seu PIN.');return;}
 if(intent.type==='clock'){say(timeAnswer(intent.date));return;}
 if(intent.type==='agenda'){say(agendaAnswer());return;}
 if(intent.type==='screen'){
  const success=window.familyDashboardVoice?.showScreen?.(intent.screen);
  say(success?'Abri '+NAMES[intent.screen]+'.':'Não consegui abrir essa tela agora.');return;
 }
 requestController=new AbortController();
 const controller=requestController;
 const timeout=setTimeout(()=>controller.abort(),18000);
 try{
  const response=await fetch('/api/voice',{
   method:'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal,
   headers:{'content-type':'application/json'},body:JSON.stringify({question:input})
  });
  if(response.type==='opaqueredirect'||!response.headers.get('content-type')?.includes('application/json'))
   throw new Error('Sua sessão expirou ou a IA não está acessível.');
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'A IA está indisponível.');
  if(enabled)say(String(data.answer||'Não consegui responder agora.'));
 }catch(error){
  if(enabled)say(error.name==='AbortError'?'A resposta demorou demais. Tente novamente.':
   String(error.message||'Sem conexão com o assistente.'));
 }finally{
  clearTimeout(timeout);
  if(requestController===controller)requestController=null;
 }
}
function activate(){
 if(!window.isSecureContext){display('Para ativar o microfone, abra o painel por HTTPS.',true);return;}
 if(!SpeechAPI)channel='cloud';
 if(channel==='cloud'&&!cloudApproved){promptCloud();return;}
 approve.hidden=true;message.classList.remove('cloud-approval');
 enabled=true;mode='wake';retryCount=0;persist(true);visual();
 if(channel==='cloud'){
  display('Modo Fire: trechos com voz enviados à OpenAI (serviço pago). Diga Hey Family.',true);
  startCloud().catch(error=>disable('Não foi possível ativar no Fully Kiosk: '+error.message));
 }else{
  display('Microfone ativado. Diga “Hey Family”. A transcrição pode usar os servidores de voz do navegador.');
  beginListening();
 }
}
toggle.addEventListener('click',()=>{if(enabled)disable();else activate();});
approve.addEventListener('click',()=>{
 cloudApproved=true;
 try{sessionStorage.setItem(CLOUD_CONSENT_KEY,'yes');}catch{}
 approve.hidden=true;
 activate(); // Still a direct user activation from this button.
});
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){
  // Stop capturing household audio when the browser is backgrounded.
  if(channel==='cloud'&&enabled)disable('Microfone pausado ao sair do Fully Kiosk. Toque para reativar.');
  else{clearTimers();halt();synth?.cancel();}
 }
 else if(enabled){mode='wake';visual();display('Tentando reativar. Se não ouvir, toque no microfone.');scheduleListen(350);}
});
visual();

// Best-effort resume after the PWA's scheduled daily refresh, only after a previous
// explicit activation in this session. Android can still require another tap.
try {
 if(sessionStorage.getItem(STORE_KEY)==='1' && channel==='webspeech' && SpeechAPI && window.isSecureContext){
  enabled=true;mode='wake';visual();
  display('Reativando Hey Family após atualizar. Se necessário, toque no microfone.');
  scheduleListen(650);
 }
} catch { /* private browsing or storage disabled */ }
