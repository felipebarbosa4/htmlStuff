// Isolated finance presentation; this public script contains no PIN or private records.
window.FinancePanel=(()=>{
 const LOCK_MS=2*60*1000;
 let active=false,view=null,within=()=>false,lastActivity=0;
 const money=n=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(n);
 const api=async(path,options={})=>{
   const response=await fetch('/api/finance/'+path,{credentials:'same-origin',cache:'no-store',...options});
   const data=await response.json();
   if(!response.ok)throw Error(data.error||'Finance is unavailable');
   return data;
 };
 const logout=()=>api('logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).catch(()=>{});
 const touch=()=>{if(active)lastActivity=Date.now();};
 function lock(){
   active=false;lastActivity=0;
   if(view?.isConnected){
     const login=view.querySelector('#finance-login'),panel=view.querySelector('#finance-data'),pin=view.querySelector('#finance-pin');
     if(login)login.hidden=false;
     if(panel){panel.hidden=true;panel.querySelector('#finance-metrics')?.replaceChildren();panel.querySelector('#finance-essential')?.replaceChildren();panel.querySelector('#finance-subscription')?.replaceChildren();}
     if(pin)pin.value='';
   }
   void logout();
 }
 function appendExpenses(target,items){
   target.replaceChildren();
   if(items.length===0){const empty=document.createElement('p');empty.className='dim';empty.textContent='No expenses imported yet. Use the private PC admin page.';target.append(empty);return;}
   for(const item of items){
     const row=document.createElement('div'),left=document.createElement('div'),right=document.createElement('div');
     row.className='finance-item';
     const name=document.createElement('strong');name.textContent=item.name;
     const detail=document.createElement('div');detail.className='finance-label';detail.textContent=(item.due||'Billing day unknown')+' · '+(item.confirmed?'Verified':'Needs verification')+' · '+item.status;
     const sum=document.createElement('strong');sum.textContent=money(item.monthlyBudget||0);
     const unit=document.createElement('div');unit.className='finance-label';unit.textContent='monthly budget';
     left.append(name,detail);right.append(sum,unit);row.append(left,right);target.append(row);
   }
 }
 async function load(){
   const data=await api('expenses');
   if(!view?.isConnected||!within()||!active)return;
   const all=Array.isArray(data.items)?data.items:[],valid=all.filter(e=>e.status!=='cancelled'&&e.status!=='paused');
   const essentials=valid.filter(e=>e.category==='essential'),rest=valid.filter(e=>e.category!=='essential');
   const sum=x=>x.reduce((n,e)=>n+Number(e.monthlyBudget||0),0);
   const metrics=view.querySelector('#finance-metrics');metrics.replaceChildren();
   for(const [label,total] of [['Essential expenses',sum(essentials)],['Subscriptions & fees',sum(rest)],['Monthly budget',sum(valid)]]){
     const box=document.createElement('div');box.className='finance-metric';
     const title=document.createElement('div');title.className='small';title.textContent=label;
     const amount=document.createElement('div');amount.className='finance-amount';amount.textContent=money(total);
     box.append(title,amount);metrics.append(box);
   }
   appendExpenses(view.querySelector('#finance-essential'),essentials);
   appendExpenses(view.querySelector('#finance-subscription'),rest);
   view.querySelector('#finance-stamp').textContent='Budget estimates only · Last updated: '+(data.updatedAt?new Date(data.updatedAt).toLocaleString('en-CA'):'not yet imported');
 }
 function mount(section,current){
   view=section;within=current;active=false;
   section.innerHTML='<div class="small">PRIVATE HOUSEHOLD · MANUAL ACCESS ONLY</div><h1 class="big">🔒 Finance</h1><div class="finance-login" id="finance-login"><form id="finance-form"><label for="finance-pin">Six-digit finance access code</label><input id="finance-pin" type="password" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" autocomplete="off" required><button type="submit">Unlock Finance</button></form><p id="finance-error" class="finance-error" role="alert"></p></div><div id="finance-data" hidden><button id="finance-lock" class="finance-lock" type="button">🔒 Lock now</button><p class="small">Automatically locks after two minutes of inactivity.</p><div class="finance-grid" id="finance-metrics"></div><h2>Essential monthly commitments</h2><div id="finance-essential"></div><h2>Subscriptions & fees</h2><div id="finance-subscription"></div><p class="foot" id="finance-stamp"></p><p class="foot">RBC and Scotiabank email transactions: pending integration.</p></div>';
   const form=section.querySelector('#finance-form'),btn=form.querySelector('button'),error=section.querySelector('#finance-error');
   form.addEventListener('submit',async event=>{
     event.preventDefault();error.textContent='';btn.disabled=true;
     try{
       const pin=section.querySelector('#finance-pin').value;
       if(!/^\d{6}$/.test(pin))throw Error('Enter a six-digit code.');
       await api('login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pin})});
       if(!section.isConnected||!within()){void logout();return;}
       active=true;touch();section.querySelector('#finance-pin').value='';
       section.querySelector('#finance-login').hidden=true;
       section.querySelector('#finance-data').hidden=false;
       await load();
     }catch(e){if(section.isConnected){lock();error.textContent=e.message;}}
     finally{btn.disabled=false;}
   });
   section.querySelector('#finance-lock').addEventListener('click',lock);
   section.querySelector('#finance-data').addEventListener('pointerdown',touch);
   section.querySelector('#finance-data').addEventListener('keydown',touch);
 }
 function tick(now){if(active&&now-lastActivity>=LOCK_MS)lock();}
 return {mount,tick,lock};
})();
