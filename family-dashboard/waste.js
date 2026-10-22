(function(){
'use strict';
const TZ='America/Toronto', KEY='family-dashboard:waste-calendar-v1', DONE='family-dashboard:waste-done:';
const REFRESH_MS=60*60*1000;
const TYPE_ORDER=['garbage','blue','black','green','yard'];
const DATA={
  garbage:{name:'Lixo comum',tag:'Cinza',color:'#abb7c5',examples:['Fraldas e absorventes','Louça e cerâmica quebrada','Itens não recicláveis','Poeira e sujeira não orgânica'],tip:'Nunca inclua pilhas ou produtos perigosos.'},
  blue:{name:'Recicláveis',tag:'Lixeira azul',color:'#57b9f9',examples:['Garrafas e potes plásticos','Latas e papel-alumínio','Potes de vidro','Caixas de leite e suco','Embalagens plásticas flexíveis'],tip:'Esvazie e enxágue. Embalagens limpas e secas.'},
  black:{name:'Papel e papelão',tag:'Lixeira preta',color:'#c0c9d8',examples:['Caixa de ovos de papel','Caixas de cereal','Papelão limpo, dobrado','Rolos de papel higiênico','Jornais e sacos de papel'],tip:'Papel e papelão limpos e secos.'},
  green:{name:'Orgânicos',tag:'Lixeira verde',color:'#87d69f',examples:['Restos e cascas de comida','Cascas de ovos e ossos','Borra de café e saquinhos de chá','Guardanapos sujos','Caixa de pizza engordurada'],tip:'Não coloque folhas de jardim aqui.'},
  yard:{name:'Jardim',tag:'Sacos de papel',color:'#e3b97f',examples:['Folhas e grama cortada','Galhos pequenos e gravetos','Podas de cerca-viva','Flores, plantas e ervas daninhas'],tip:'Use sacos de papel marrom ou recipientes aprovados; separado da lixeira verde.'}
};
const icons={
  garbage:'<rect x="13" y="21" width="38" height="36" rx="5"/><path d="M9 20h46M22 15h20M24 30v18M40 30v18"/>',
  blue:'<rect x="12" y="18" width="40" height="39" rx="5"/><path d="M9 18h46M21 12h22M24 30l7-7 7 7M31 23v20M23 45h16"/>',
  black:'<rect x="12" y="18" width="40" height="39" rx="5"/><path d="M9 18h46M20 12h24M23 30h18M23 38h18M23 46h12"/>',
  green:'<rect x="12" y="18" width="40" height="39" rx="5"/><path d="M9 18h46M21 12h22M31 46c-13-6-14-19 7-21 3 13-2 19-7 21ZM31 46l7-13"/>',
  yard:'<path d="M19 11h26l-4 15 8 29H15l8-29-4-15Z"/><path d="M23 26h18M24 15h16M32 41V29M32 39c-5-1-8-4-8-8M32 35c5-1 8-4 8-8"/>'
};
const state={events:[],checkedAt:'',receivedAt:0,attemptAt:0,loading:false,error:''};
function day(offset=0){
 const arr=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const p=Object.fromEntries(arr.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return new Date(Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day)+offset)).toISOString().slice(0,10);
}
function validEvent(e){return e&&/^\d{4}-\d{2}-\d{2}$/.test(e.date)&&Array.isArray(e.types)&&e.types.every(x=>TYPE_ORDER.includes(x));}
function remember(){try{localStorage.setItem(KEY,JSON.stringify({events:state.events,checkedAt:state.checkedAt,receivedAt:state.receivedAt}));}catch{}}
function restore(){try{const v=JSON.parse(localStorage.getItem(KEY)||'null');if(Array.isArray(v?.events)&&v.events.every(validEvent)){state.events=v.events;state.checkedAt=v.checkedAt||'';state.receivedAt=Number(v.receivedAt)||0;}}catch{}}
function isDone(date){try{return localStorage.getItem(DONE+date)==='yes';}catch{return false;}}
function setDone(date,done){try{if(done)localStorage.setItem(DONE+date,'yes');else localStorage.removeItem(DONE+date);}catch{}}
function dateEvent(date){return state.events.find(e=>e.date===date)||null;}
function nextEvent(){return state.events.find(e=>e.date>=day())||null;}
function dateLabel(value){const s=new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'}).format(new Date(value+'T12:00:00Z'));return s[0].toUpperCase()+s.slice(1);}
function hourMinute(p){return Number(p.hour)*60+Number(p.minute);}
function slot(p){const n=hourMinute(p);if(dateEvent(day(1))&&!isDone(day(1))&&n>=1200)return {kind:'tomorrow',event:dateEvent(day(1))};if(dateEvent(day())&&!isDone(day())&&n>=525&&n<600)return {kind:'today',event:dateEvent(day())};return null;}
async function refresh(force=false){
 const now=Date.now();if(state.loading||(!force&&now<state.attemptAt))return;
 state.attemptAt=now+REFRESH_MS;state.loading=true;
 try{
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
   let res;try{res=await fetch('/api/waste',{cache:'no-store',signal:controller.signal});}finally{clearTimeout(timer);}
   if(!res.ok)throw new Error('HTTP '+res.status);
   const data=await res.json();
   if(!Array.isArray(data.events)||!data.events.length||!data.events.every(validEvent))throw new Error('Calendário inválido');
   state.events=data.events.sort((a,b)=>a.date.localeCompare(b.date));
   state.checkedAt=data.checkedAt||'';state.receivedAt=Date.now();state.error='';remember();
   window.dispatchEvent(new CustomEvent('waste-calendar-updated'));
 }catch{state.error='Não foi possível atualizar a coleta. Confira Ottawa se houve mudança.';state.attemptAt=now+5*60*1000;}
 finally{state.loading=false;}
}
function icon(type){return '<svg class="waste-bin-icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[type]+'</svg>';}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function mount(view,onComplete){
 const renderView=()=>{
 if(!view.isConnected)return;
 const active=slot({hour:new Intl.DateTimeFormat('en-GB',{timeZone:TZ,hour:'2-digit',hourCycle:'h23'}).format(new Date()),minute:new Intl.DateTimeFormat('en-GB',{timeZone:TZ,minute:'2-digit'}).format(new Date())});
 const today=dateEvent(day()),future=nextEvent(),event=active?.event||today||future;
 if(!event){view.innerHTML='<div class="waste-loading"><h1>♻️ Coleta de lixo</h1><p>'+(state.loading?'Buscando o calendário oficial de Ottawa…':'Calendário indisponível no momento.')+'</p><a href="https://ottawa.ca/collectioncalendar" target="_blank" rel="noopener">Ver calendário oficial ↗</a></div>';return;}
 const done=isDone(event.date);
 const heading=active?.kind==='tomorrow'?'COLETA AMANHÃ':event.date===day()?'COLETA HOJE':'PRÓXIMA COLETA';
 const cards=TYPE_ORDER.filter(t=>event.types.includes(t)).map(t=>{
 const c=DATA[t];return '<article class="waste-card waste-'+t+'" style="--bin-color:'+c.color+'"><div class="waste-card-head">'+icon(t)+'<div><div class="waste-tag">'+c.tag+'</div><h2>'+c.name+'</h2></div></div><ul>'+c.examples.map(x=>'<li>'+escapeHtml(x)+'</li>').join('')+'</ul><p class="waste-tip">'+escapeHtml(c.tip)+'</p></article>';
 }).join('');
 const from=state.checkedAt?new Intl.DateTimeFormat('pt-BR',{timeZone:TZ,day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(state.checkedAt)):'não sincronizado';
 const warning=state.error?'<span class="waste-warning">'+escapeHtml(state.error)+'</span>':'';
 view.innerHTML='<div class="waste-panel"><div class="waste-header"><div><div class="waste-eyebrow">♻️ '+heading+'</div><h1>'+dateLabel(event.date)+'</h1><p>Separe os materiais conforme a coleta de Ottawa.</p></div><div class="waste-date-status">'+(done?'✓ CONCLUÍDO':'ATÉ 7H DA MANHÃ')+'</div></div><div class="waste-grid waste-count-'+event.types.length+'">'+cards+'</div><div class="waste-bottom"><button type="button" class="waste-done'+(done?' waste-done-active':'')+'">'+(done?'✓ Lixeiras já colocadas · desfazer':'✓ Já coloquei tudo para fora')+'</button><div class="waste-source">'+warning+'Atualizado: '+from+' · <a href="https://ottawa.ca/collectioncalendar" target="_blank" rel="noopener">Ottawa ↗</a> · <a href="https://www.circularmaterials.ca/resident-communities/ottawa/" target="_blank" rel="noopener">Reciclagem ↗</a></div></div></div>';
 view.querySelector('.waste-done')?.addEventListener('click',()=>{setDone(event.date,!isDone(event.date));renderView();if(onComplete && isDone(event.date))onComplete();});
 };
 renderView();const onUpdate=()=>renderView();window.addEventListener('waste-calendar-updated',onUpdate,{signal:(()=>{const c=new AbortController(); const observer=new MutationObserver(()=>{if(!view.isConnected){c.abort();observer.disconnect();}});observer.observe(document.body,{childList:true,subtree:true});return c.signal;})()});
 refresh(); 
}
restore();
window.WastePanel={refresh,slot,mount,isDone,day,dateEvent};
refresh();
})();