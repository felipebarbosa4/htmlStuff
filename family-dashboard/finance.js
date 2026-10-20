// Family Finance: Notion-inspired presentation. No PIN or private expenses are bundled here.
window.FinancePanel=(()=>{
 'use strict';
 const LOCK_MS=2*60*1000;
 const SESSION_MS=3*60*1000;
 const PAGE_SIZE=()=>window.innerHeight<850?4:6;
 const currency=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'CAD',maximumFractionDigits:2}).format(Number(value)||0);
 const amount=items=>items.reduce((sum,item)=>sum+Number(item.monthlyBudget||0),0);
 const categories={essential:'Essenciais',subscription:'Assinaturas',fee:'Tarifas'};
 const periods={monthly:'Mensal',biweekly:'A cada 14 dias',weekly:'Semanal',quarterly:'Trimestral',yearly:'Anual'};
 const statuses={active:'Ativo',review:'A revisar',paused:'Pausado',cancelled:'Cancelado'};
 const activeItem=item=>!['paused','cancelled'].includes(item.status);
 let view=null,within=()=>false,unlocked=false,lastActivity=0,expiresAt=0;
 let records=[],tab='overview',page=0,details=null,updatedAt='';
 const el=(tag,className,text)=>{
  const element=document.createElement(tag);
  if(className)element.className=className;
  if(text!==undefined)element.textContent=text;
  return element;
 };
 async function api(path,options={}){
  const response=await fetch('/api/finance/'+path,{credentials:'same-origin',cache:'no-store',...options});
  if(!response.headers.get('content-type')?.includes('application/json'))throw Error('Entre novamente no Cloudflare Access para ver suas finanças.');
  const data=await response.json();
  if(!response.ok)throw Error(data.error||'Não foi possível carregar suas finanças.');
  return data;
 }
 function logout(){
  return api('logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).catch(()=>{});
 }
 function touch(){if(unlocked)lastActivity=Date.now();}
 function closeDetails(){
  if(details){details.remove();details=null;}
 }
 function lock(){
  closeDetails();
  unlocked=false;lastActivity=0;expiresAt=0;records=[];updatedAt='';
  if(view?.isConnected){
   const login=view.querySelector('#finance-login'),panel=view.querySelector('#finance-data');
   if(login)login.hidden=false;
   if(panel)panel.hidden=true;
   const lockButton=view.querySelector('#finance-lock');if(lockButton)lockButton.hidden=true;
   view.querySelector('#finance-content')?.replaceChildren();
   view.querySelector('#finance-summary')?.replaceChildren();
   const pin=view.querySelector('#finance-pin');
   if(pin)pin.value='';
   view.querySelectorAll('.finance-pin-dot').forEach(dot=>dot.classList.remove('filled'));
   view.querySelector('#finance-pin-entry')?.removeAttribute('aria-busy');
  }
  void logout();
 }
 function statusLabel(item){
  if(item.status==='cancelled')return 'Cancelado';
  if(item.status==='paused')return 'Pausado';
  return item.confirmed?'Confirmado':'Conferir';
 }
 function statusBadge(item){
  const tag=el('span','finance-tag'+(item.confirmed&&activeItem(item)?' verified':''),statusLabel(item));
  return tag;
 }
 function addMetric(container,label,value,sub,main){
  const box=el('article','finance-stat'+(main?' main':''));
  box.append(el('div','finance-stat-label',label),el('div','finance-stat-number',currency(value)),el('div','finance-stat-sub',sub));
  container.append(box);
 }
 function renderSummary(){
  const live=records.filter(activeItem);
  const essentials=live.filter(x=>x.category==='essential'),other=live.filter(x=>x.category!=='essential');
  const metrics=view.querySelector('#finance-summary');
  metrics.replaceChildren();
  addMetric(metrics,'Total reservado por mês',amount(live),'Estimativa mensal · CAD',true);
  addMetric(metrics,'Essenciais',amount(essentials),essentials.length+' despesas');
  addMetric(metrics,'Assinaturas e tarifas',amount(other),other.length+' cobranças');
 }
 function detailLine(parent,label,value){
  const row=el('div','finance-detail-line');
  row.append(el('span','',label),el('strong','',String(value||'A confirmar')));
  parent.append(row);
 }
 function showDetails(item){
  if(!unlocked)return;
  touch();
  closeDetails();
  const overlay=el('div','finance-modal');overlay.setAttribute('role','presentation');
  const dialog=el('section','finance-dialog');
  dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label','Detalhes do gasto');
  const head=el('div','finance-dialog-head');
  const names=el('div');
  names.append(el('div','finance-kicker',categories[item.category]||'Gasto'),el('h2','',item.name));
  const close=el('button','finance-dialog-close','Fechar');close.type='button';
  close.addEventListener('click',closeDetails);
  head.append(names,close);
  dialog.append(head);
  detailLine(dialog,'Provisão mensal',currency(item.monthlyBudget));
  detailLine(dialog,'Frequência',periods[item.frequency]||'Não informada');
  detailLine(dialog,'Data ou padrão',item.due||'A confirmar');
  detailLine(dialog,'Situação',statuses[item.status]||'A revisar');
  detailLine(dialog,'Valor verificado',item.confirmed?'Sim':'Ainda não');
  if(item.note)dialog.append(el('p','finance-detail-notes',item.note));
  overlay.append(dialog);
  overlay.addEventListener('pointerdown',e=>{if(e.target===overlay)closeDetails();else touch();});
  overlay.addEventListener('keydown',e=>{if(e.key==='Escape')closeDetails();});
  view.append(overlay);details=overlay;
  close.focus();
 }
 function renderOverview(){
  const content=view.querySelector('#finance-content');
  const live=records.filter(activeItem);
  const ess=live.filter(x=>x.category==='essential');
  const other=live.filter(x=>x.category!=='essential');
  const total=amount(live),eTotal=amount(ess),oTotal=amount(other);
  const header=el('div','finance-section-header');
  const text=el('div');text.append(el('h2','','Visão geral'),el('p','','Como suas despesas fixas estão distribuídas'));
  header.append(text);content.append(header);
  const grid=el('div','finance-overview');
  const budget=el('section','finance-box');
  budget.append(el('h3','','Distribuição do orçamento'));
  const bar=el('div','finance-breakdown');
  bar.setAttribute('role','img');bar.setAttribute('aria-label','Essenciais '+(total?Math.round(eTotal/total*100):0)+'%; assinaturas e tarifas '+(total?Math.round(oTotal/total*100):0)+'%');
  const first=el('div','ess'),second=el('div','sub');
  first.style.width=(total?eTotal/total*100:0)+'%';
  second.style.width=(total?oTotal/total*100:0)+'%';
  bar.append(first,second);budget.append(bar);
  const legend=el('div','finance-legend');
  for(const [label,value,cls] of [['Essenciais',eTotal,''],['Assinaturas e tarifas',oTotal,'sub']]){
   const row=el('div','finance-legend-line');
   const l=el('span');l.append(el('span','finance-bullet'+(cls?' '+cls:'')),document.createTextNode(label));
   row.append(l,el('strong','',currency(value)));legend.append(row);
  }
  budget.append(legend);
  const largest=el('section','finance-box');
  largest.append(el('h3','','Maiores despesas mensais'));
  const top=live.slice().sort((a,b)=>Number(b.monthlyBudget)-Number(a.monthlyBudget)).slice(0,3);
  if(!top.length)largest.append(el('p','finance-empty','Ainda não há despesas cadastradas.'));
  for(const x of top){
   const row=el('div','finance-highlight-row'),left=el('div');
   left.append(el('strong','',x.name),el('span','finance-meta',x.due||'Data a confirmar'));
   row.append(left,el('strong','',currency(x.monthlyBudget)));largest.append(row);
  }
  grid.append(budget,largest);content.append(grid);
 }
 function renderTable(){
  const content=view.querySelector('#finance-content');
  const category=tab==='essential'?'essential':'subscription';
  const filtered=records.filter(x=>category==='essential'?x.category==='essential':x.category!=='essential')
                        .sort((a,b)=>Number(b.monthlyBudget)-Number(a.monthlyBudget));
  const header=el('div','finance-section-header'),title=el('div');
  const sectionTitle=category==='essential'?'Despesas essenciais':'Assinaturas e tarifas';
  title.append(el('h2','',sectionTitle),el('p','','Toque em uma linha para ver detalhes e observações'));
  header.append(title,el('span','finance-tag',filtered.length+' registros'));
  content.append(header);
  if(!filtered.length){content.append(el('p','finance-empty','Nenhuma despesa cadastrada nesta categoria.'));return;}
  const totalPages=Math.ceil(filtered.length/PAGE_SIZE());
  page=Math.min(page,totalPages-1);
  const table=el('table','finance-table');
  const col=el('colgroup');
  for(const width of ['45%','34%','21%']){const c=el('col');c.style.width=width;col.append(c);}
  table.append(col);
  const thead=el('thead'),thr=el('tr');
  for(const label of ['Despesa','Cobrança prevista','Por mês'])thr.append(el('th','',label));
  thead.append(thr);table.append(thead);
  const tbody=el('tbody');
  const selected=filtered.slice(page*PAGE_SIZE(),(page+1)*PAGE_SIZE());
  for(const item of selected){
   const tr=el('tr');
   tr.tabIndex=0;tr.setAttribute('role','button');tr.setAttribute('aria-label','Ver detalhes de '+item.name);
   const left=el('td'),main=el('div','finance-name',item.name),badge=statusBadge(item);
   badge.style.marginTop='5px';left.append(main,badge);
   const due=el('td','',item.due||'A confirmar');
   const number=el('td','',currency(item.monthlyBudget));
   tr.append(left,due,number);
   tr.addEventListener('click',()=>showDetails(item));
   tr.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();showDetails(item);}});
   tbody.append(tr);
  }
  table.append(tbody);content.append(table);
  const nav=el('div','finance-pagination');
  nav.append(el('span','',(page*PAGE_SIZE()+1)+'–'+(page*PAGE_SIZE()+selected.length)+' de '+filtered.length+' despesas'));
  const right=el('div');right.style.display='flex';right.style.gap='7px';
  const prev=el('button','','← Anterior');prev.disabled=page===0;
  const next=el('button','','Próxima →');next.disabled=page>=totalPages-1;
  prev.addEventListener('click',()=>{touch();page--;renderContent();});
  next.addEventListener('click',()=>{touch();page++;renderContent();});
  right.append(prev,next);nav.append(right);content.append(nav);
 }
 function renderContent(){
  if(!unlocked||!view?.isConnected||!within())return;
  closeDetails();
  for(const btn of view.querySelectorAll('[data-finance-tab]')){
   const selected=btn.dataset.financeTab===tab;
   btn.setAttribute('aria-selected',String(selected));btn.tabIndex=selected?0:-1;
  }
  const content=view.querySelector('#finance-content');content.replaceChildren();
  if(tab==='overview')renderOverview();else renderTable();
  const activeCount=records.filter(activeItem).length,reviewCount=records.filter(x=>!x.confirmed&&activeItem(x)).length;
  view.querySelector('#finance-note').textContent='Valores provisionados, não pagamentos efetuados. '+reviewCount+' de '+activeCount+' registros ainda precisam de conferência.';
 }
 async function load(){
  const data=await api('expenses');
  if(!view?.isConnected||!within()||!unlocked)return;
  records=Array.isArray(data.items)?data.items:[];
  updatedAt=data.updatedAt||'';
  tab='overview';page=0;
  const essentialCount=records.filter(x=>x.category==='essential').length;
  const extraCount=records.length-essentialCount;
  view.querySelector('[data-finance-tab="essential"] .finance-count').textContent=' '+essentialCount;
  view.querySelector('[data-finance-tab="subscription"] .finance-count').textContent=' '+extraCount;
  renderSummary();renderContent();
 }
 function mount(section,current){
  view=section;within=current;unlocked=false;records=[];page=0;tab='overview';
  section.classList.add('finance-view');
  section.innerHTML='<div class="finance-shell"><div class="finance-top"><div><div class="finance-kicker">🔒 ÁREA PRIVADA</div><h1 class="finance-heading">Finanças da família</h1><p class="finance-caption">Contas fixas e assinaturas em um só lugar</p></div><button id="finance-lock" class="finance-lock" type="button" hidden>🔒 Bloquear</button></div><section id="finance-login" class="finance-login"><h2>Acesso protegido</h2><p class="finance-caption">Digite o código de 6 números para visualizar.</p><form id="finance-form"><label for="finance-pin">Código de acesso</label><div class="finance-pin-entry" id="finance-pin-entry"><div class="finance-pin-dots" aria-hidden="true"><span class="finance-pin-dot"></span><span class="finance-pin-dot"></span><span class="finance-pin-dot"></span><span class="finance-pin-dot"></span><span class="finance-pin-dot"></span><span class="finance-pin-dot"></span></div><input id="finance-pin" class="finance-pin-input" type="text" inputmode="numeric" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="6" pattern="[0-9]{6}" aria-label="PIN de seis dígitos" aria-describedby="finance-pin-help" required></div><p class="finance-pin-help" id="finance-pin-help">Toque nas bolinhas e digite o PIN. Acesso automático após 6 números.</p></form><p class="finance-error" role="alert" id="finance-error"></p><p class="finance-security">Os dados financeiros não ficam salvos no tablet.</p></section><div id="finance-data" hidden><div class="finance-summary" id="finance-summary"></div><nav class="finance-tabs" role="tablist" aria-label="Categorias das finanças"><button type="button" role="tab" class="finance-tab" data-finance-tab="overview" aria-selected="true">📊 Resumo</button><button type="button" role="tab" class="finance-tab" data-finance-tab="essential" aria-selected="false">🏠 Essenciais <span class="finance-count"></span></button><button type="button" role="tab" class="finance-tab" data-finance-tab="subscription" aria-selected="false">🔁 Assinaturas <span class="finance-count"></span></button></nav><div id="finance-content" class="finance-content" role="tabpanel"></div><div id="finance-note" class="finance-note"></div></div></div>';
  const form=section.querySelector('#finance-form'),pinInput=section.querySelector('#finance-pin');
  const pinEntry=section.querySelector('#finance-pin-entry'),dots=[...section.querySelectorAll('.finance-pin-dot')];
  const error=section.querySelector('#finance-error');
  let submitting=false;
  function renderPin(){
   const numbers=pinInput.value.replace(/\D/g,'').slice(0,6);
   if(pinInput.value!==numbers)pinInput.value=numbers;
   dots.forEach((dot,index)=>dot.classList.toggle('filled',index<numbers.length));
   return numbers;
  }
  pinInput.addEventListener('input',()=>{
   const numbers=renderPin();
   error.textContent='';
   if(numbers.length===6&&!submitting&&!unlocked)form.requestSubmit();
  });
  pinEntry.addEventListener('click',()=>pinInput.focus());
  form.addEventListener('submit',async event=>{
   event.preventDefault();
   if(submitting)return;
   submitting=true;pinEntry.setAttribute('aria-busy','true');error.textContent='';
   try{
    const pin=renderPin();
    if(!/^\d{6}$/.test(pin))throw Error('Digite um código com 6 números.');
    await api('login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pin})});
    if(!section.isConnected||!within()){void logout();return;}
    unlocked=true;lastActivity=Date.now();expiresAt=Date.now()+SESSION_MS;
    pinInput.value='';renderPin();
    section.querySelector('#finance-login').hidden=true;
    section.querySelector('#finance-data').hidden=false;
    section.querySelector('#finance-lock').hidden=false;
    await load();
   }catch(e){
    if(section.isConnected){lock();error.textContent=e.message;}
   }finally{submitting=false;pinEntry.removeAttribute('aria-busy');}
  });
  section.querySelector('#finance-lock').addEventListener('click',()=>{lock();view.querySelector('#finance-lock').hidden=true;});
  section.querySelector('#finance-data').addEventListener('pointerdown',touch);
  section.querySelector('#finance-data').addEventListener('keydown',touch);
  for(const button of section.querySelectorAll('[data-finance-tab]')){
   button.addEventListener('click',()=>{
    if(!unlocked)return;
    touch();tab=button.dataset.financeTab;page=0;renderContent();
   });
  }
  section.querySelector('#finance-data').hidden=true;
 }
 function tick(now){
  if(unlocked&&(now-lastActivity>=LOCK_MS||now>=expiresAt))lock();
 }
 return {mount,tick,lock};
})();
