import {extractWakePhrase,localIntent,nextAgenda} from './voice-core.mjs';

// Browsers require an initial user tap to grant microphone access. The wake phrase
// is transcribed by Chrome's Web Speech API, not a custom offline wake-word engine.
const SpeechAPI=window.SpeechRecognition||window.webkitSpeechRecognition;
const synth=window.speechSynthesis;
const root=document.createElement('aside');
root.className='family-voice';
root.setAttribute('aria-label','Assistente de voz da família');
root.innerHTML='<div class="family-voice-message" role="status" aria-live="polite" hidden><strong>Hey Family</strong><span class="family-voice-detail"></span></div>'+
 '<button type="button" class="family-voice-toggle" aria-label="Ativar assistente de voz" aria-pressed="false" title="Ativar Hey Family">🎙️</button>';
document.body.appendChild(root);
const toggle=root.querySelector('button');
const message=root.querySelector('.family-voice-message');
const detail=root.querySelector('.family-voice-detail');

let enabled=false, mode='off', listening=false, instance=null;
let restartTimer=null, commandTimer=null, messageTimer=null, requestController=null;
let retryCount=0;
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
 const current=instance;
 instance=null;listening=false;
 if(current){try{current.abort();}catch{/* browser already stopped */}}
}
function disable(reason){
 enabled=false;mode='off';persist(false);clearTimers();
 requestController?.abort();requestController=null;
 halt();
 synth?.cancel();
 retryCount=0;
 visual();
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
 if(!SpeechAPI){disable('Este Chrome não oferece reconhecimento de voz.');return;}
 try{
  const rec=new SpeechAPI();
  instance=rec;
  rec.lang='pt-BR';rec.continuous=true;rec.interimResults=false;rec.maxAlternatives=1;
  rec.onstart=()=>{
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
    retryCount=0;
    if(mode==='wake'){
     const remainder=extractWakePhrase(transcript);
     if(remainder===null)continue;
     clearTimeout(commandTimer);
     if(remainder){processQuestion(remainder);return;}
     mode='command';visual();halt();
     say('Oi, pode perguntar.', 'command');
     return;
    }
    if(mode==='command' && transcript){processQuestion(transcript);return;}
   }
  };
  rec.onerror=event=>{
   if(instance!==rec||!enabled)return;
   const code=String(event.error||'');
   if(code==='not-allowed'||code==='service-not-allowed'||code==='audio-capture'){
    disable('Microfone bloqueado. Permita o acesso nas configurações do Chrome e toque aqui novamente.');return;
   }
   if(code==='no-speech'||code==='aborted')return;
   retryCount++;
   if(retryCount>=4){
    disable('O reconhecimento de voz parou. Confira a conexão e toque no microfone para reativar.');return;
   }
   display('Reconectando o reconhecimento de voz…');
  };
  rec.onend=()=>{
   if(instance!==rec)return;
   listening=false;instance=null;
   if(enabled&&['wake','command'].includes(mode))scheduleListen(retryCount?Math.min(4000,retryCount*900):300);
  };
  // Never initiate permission prompts on load: only after the user enables the mic.
  rec.start();
 }catch{
  retryCount++;
  if(retryCount>=4)disable('Não consegui iniciar o microfone. Toque novamente para tentar.');
  else scheduleListen(Math.min(3000,retryCount*700));
 }
}
function say(text,next='wake'){
 const answer=String(text||'').slice(0,850);
 display(answer);
 if(!enabled)return;
 mode='speaking';visual();clearTimeout(commandTimer);halt();
 if(!synth||!window.SpeechSynthesisUtterance){
  mode=next;visual();scheduleListen(300);return;
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
  const watchdog=setTimeout(()=>{if(!completed){synth.cancel();finish();}},15000);
  const finish=()=>{if(completed)return;completed=true;clearTimeout(watchdog);
   if(enabled&&mode==='speaking'){mode=next;visual();scheduleListen(400);}};
  u.onend=finish;u.onerror=finish;
  synth.speak(u);
 }catch{mode=next;visual();scheduleListen(500);}
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
toggle.addEventListener('click',()=>{
 if(enabled){disable();return;}
 if(!SpeechAPI){display('Reconhecimento de voz indisponível neste navegador.',true);return;}
 if(!window.isSecureContext){display('Para ativar o microfone, abra o painel por HTTPS.',true);return;}
 enabled=true;mode='wake';retryCount=0;persist(true);visual();
 display('Microfone ativado. Diga “Hey Family”. A transcrição pode usar os servidores de voz do navegador.');
 beginListening(); // Directly in the tap handler (Android user activation).
});
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){clearTimers();halt();synth?.cancel();}
 else if(enabled){mode='wake';visual();display('Tentando reativar. Se não ouvir, toque no microfone.');scheduleListen(350);}
});
visual();

// Best-effort resume after the PWA's scheduled daily refresh, only after a previous
// explicit activation in this session. Android can still require another tap.
try {
 if(sessionStorage.getItem(STORE_KEY)==='1' && SpeechAPI && window.isSecureContext){
  enabled=true;mode='wake';visual();
  display('Reativando Hey Family após atualizar. Se necessário, toque no microfone.');
  scheduleListen(650);
 }
} catch { /* private browsing or storage disabled */ }
