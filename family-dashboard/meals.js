(function(){
'use strict';
const KEY='family-dashboard:meals-cache-v1',SEEN='family-dashboard:meals-slide-v1';
const state={meals:[],updatedAt:null,error:'',loading:false,lastFetch:0,offset:0};
function escapeText(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function today(){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const p=Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return p.year+'-'+p.month+'-'+p.day;
}
function shuffleDaily(meals){
 const copy=meals.slice();let seed=0;
 for(const x of today())seed=(seed*31+x.charCodeAt(0))>>>0;
 for(let i=copy.length-1;i>0;i--){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=seed%(i+1);[copy[i],copy[j]]=[copy[j],copy[i]];}
 return copy;
}
function chosen(){
 const ordered=shuffleDaily(state.meals);
 if(!ordered.length)return [];
 const offset=(state.offset*4)%ordered.length;
 return Array.from({length:Math.min(4,ordered.length)},(_,i)=>ordered[(offset+i)%ordered.length]);
}
function saveCache(){try{localStorage.setItem(KEY,JSON.stringify({meals:state.meals,updatedAt:state.updatedAt}));}catch{}}
function restore(){try{const o=JSON.parse(localStorage.getItem(KEY)||'null');if(Array.isArray(o?.meals)){state.meals=o.meals;state.updatedAt=o.updatedAt;}}catch{}}
async function refresh(force=false){
 if(state.loading||(!force&&Date.now()-state.lastFetch<5*60*1000))return;
 state.loading=true;state.lastFetch=Date.now();
 try{
  const res=await fetch('/api/meals',{credentials:'same-origin',cache:'no-store',redirect:'manual'});
  if(!res.ok||!res.headers.get('content-type')?.includes('application/json'))throw new Error('Servidor de refeições indisponível.');
  const data=await res.json();if(!Array.isArray(data.meals))throw new Error('Lista inválida');
  state.meals=data.meals;state.updatedAt=data.updatedAt;state.error='';saveCache();
 }catch{state.error='Não foi possível sincronizar; exibindo o último cardápio disponível.';}
 finally{state.loading=false;window.dispatchEvent(new Event('family-meals-updated'));}
}
function card(m){
 const pic=m.image?'<img loading="eager" src="'+escapeText(m.image)+'" alt="Foto ilustrativa: '+escapeText(m.name)+'">':'<div class="meal-no-photo" aria-label="Sem foto cadastrada">🍽️</div>';
 return '<article class="meal-card"><div class="meal-photo">'+pic+'</div><div class="meal-card-info"><h2>'+escapeText(m.name)+'</h2><div class="meal-minutes">⏱ '+Math.round(Number(m.minutes)||30)+' min</div><p>'+escapeText(m.description||'Comida de casa, simples e gostosa.')+'</p><div class="meal-ingredients"><strong>Ingredientes</strong><span>'+escapeText((m.ingredients||[]).slice(0,7).join(' · '))+'</span></div></div></article>';
}
function mount(view){
 const draw=()=>{
  if(!view.isConnected)return;
  const shown=chosen(),loading=state.loading&&!state.meals.length;
  const stamp=state.updatedAt?' · atualizado '+new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Toronto',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(state.updatedAt)):'';
  view.innerHTML='<div class="meals-panel"><header class="meals-header"><div><div class="meals-eyebrow">🍲 IDEIAS PARA O ALMOÇO</div><h1>O que vamos comer hoje?</h1><p>Comidinhas brasileiras, simples e feitas em casa.</p></div><div class="meals-today">'+new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Toronto',weekday:'long',day:'numeric',month:'long'}).format(new Date())+'</div></header>'+
  (shown.length?'<div class="meal-grid">'+shown.map(card).join('')+'</div>':'<div class="meals-empty">'+(loading?'Carregando as refeições…':'Nenhuma refeição encontrada. Cadastre suas favoritas no computador.')+'</div>')+
  '<footer class="meals-footer"><div class="meals-footer-actions"><button type="button" class="meals-refresh" '+(state.meals.length<5?'disabled':'')+'>↻ Outras ideias</button><a class="meals-manage" href="/family-dashboard/meals-admin/" target="_blank" rel="noopener">✎ Gerenciar refeições</a></div><div class="meals-source">'+(state.error?'<span class="meals-warning">'+escapeText(state.error)+'</span>':'')+state.meals.length+' pratos cadastrados'+stamp+' · <a href="/family-dashboard/meals/credits.html" target="_blank" rel="noopener">Créditos das fotos</a></div></footer></div>';
  view.querySelector('.meals-refresh')?.addEventListener('click',()=>{state.offset++;draw();});
 };
 draw();refresh();
 // Re-render only while mounted, even if a previous API request resolves after leaving the panel.
 const controller=new AbortController();
 window.addEventListener('family-meals-updated',draw,{signal:controller.signal});
 const observer=new MutationObserver(()=>{if(!view.isConnected){controller.abort();observer.disconnect();}});
 observer.observe(document.getElementById('stage'),{childList:true,subtree:true});
}
restore();
window.MealsPanel={mount,refresh,renderToday:today,shuffleDaily};
})();