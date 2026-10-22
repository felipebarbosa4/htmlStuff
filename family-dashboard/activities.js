(function(){
'use strict';
const TZ='America/Toronto';
const ICON={park:'🌳',indoor:'🤸',museum:'🏛️',recreation:'🏊',library:'📚',animals:'🐾',food:'🍽️',culture:'🎭',cinema:'🎬',landmark:'🏛️'};
const URLSAFE=url=>{try{const u=new URL(url);return u.protocol==='https:'?u.href:'';}catch{return '';}};
const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
const stamp=s=>{const t=Date.parse(s);return Number.isFinite(t)?new Intl.DateTimeFormat('en-CA',{timeZone:TZ,month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(t):'Not generated'};
const fmt=()=>{
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,weekday:'short',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date());
 return parts;
};
const types={ideas:'Ideas',events:'Events Today',movies:'Movies This Month'};
const budgets=[['free','Free'],['under100','Under $100'],['any','Any budget']];
const envs=[['all','Both'],['indoor','Indoor'],['outdoor','Outdoor']];
const defaults={family:{adults:2,kids:2},couple:{adults:2,kids:0},visits:{adults:4,kids:2}};
const savedControls=(()=>{try{return JSON.parse(localStorage.getItem('family:activities:controls:v2')||'{}');}catch{return {};}})();
let cleanup=null;
window.ActivitiesPanel={
 destroy(){if(cleanup){cleanup();cleanup=null;}},
 mount(host,isActive){
  this.destroy();
  const ctrl=new AbortController(),signal=ctrl.signal;
  const root=el('section','activities-root');root.setAttribute('aria-label','Family outing planner');
  host.appendChild(root);
  root.innerHTML=`<div class="activities-top"><div><h1>✨ What to Do</h1><div class="activities-sub" id="ideas-status">Ottawa · <span id="ideas-clock"></span> · Only refresh on request</div></div><button id="ideas-refresh" type="button" class="activities-refresh">↻ Refresh Ideas</button></div>
  <div class="activities-controls">
    <div class="activities-modes" role="group" aria-label="Outing type"><button data-mode-choice="couple">❤️ Couple</button><button data-mode-choice="family">👨‍👩‍👧‍👦 Family</button><button data-mode-choice="visits">🏠 Visits</button></div>
    <div class="activities-filters">
      <div class="activities-count"><span>Adults</span><button data-count="adults" data-step="-1" aria-label="Remove adult">−</button><strong id="count-adults">2</strong><button data-count="adults" data-step="1" aria-label="Add adult">+</button></div>
      <div class="activities-count"><span>Kids</span><button data-count="kids" data-step="-1" aria-label="Remove child">−</button><strong id="count-kids">2</strong><button data-count="kids" data-step="1" aria-label="Add child">+</button></div>
      <label class="activities-select">Budget<select id="ideas-budget" aria-label="Budget"><option value="free">Free</option><option value="under100">Under $100</option><option value="any">Any budget</option></select></label>
      <div class="activities-env" role="group" aria-label="Activity environment"><button data-env="all">Both</button><button data-env="indoor">Indoor</button><button data-env="outdoor">Outdoor</button></div>
    </div>
    <div class="activities-tabs" role="tablist" aria-label="Recommendations sections"><button role="tab" data-kind="ideas">✨ Ideas</button><button role="tab" data-kind="events">🎟 Events</button><button role="tab" data-kind="movies">🎬 Movies</button></div>
  </div>
  <div class="activities-grid" id="ideas-grid" aria-live="polite"></div>
  <div class="activities-footer"><span id="ideas-caption">📍 20 km by road · Google Maps</span><div class="activities-pages"><button id="ideas-prev" aria-label="Previous page">‹</button><span id="ideas-page">1 / 1</span><button id="ideas-next" aria-label="Next page">›</button></div></div>`;
  const q=s=>root.querySelector(s),grid=q('#ideas-grid'),meta=q('#ideas-status'),refresh=q('#ideas-refresh');
  const pageLabel=q('#ideas-page'),caption=q('#ideas-caption');
  const state={
    mode:['couple','family','visits'].includes(savedControls.mode)?savedControls.mode:'family',
    budget:['free','under100','any'].includes(savedControls.budget)?savedControls.budget:'any',
    environment:['all','indoor','outdoor'].includes(savedControls.environment)?savedControls.environment:'all',
    kind:'ideas',adults:2,kids:2,items:[],snapshot:null,
    page:0,error:'',busy:false,feedback:new Map(),photos:new Map(),modal:null
  };
  Object.assign(state,defaults[state.mode]);
  if(Number.isInteger(savedControls.adults))state.adults=Math.max(1,Math.min(8,savedControls.adults));
  if(Number.isInteger(savedControls.kids))state.kids=Math.max(0,Math.min(10,savedControls.kids));
  const params=()=>({mode:state.mode,adults:state.adults,kids:state.kids,budget:state.budget,environment:state.environment});
  const persist=()=>{try{localStorage.setItem('family:activities:controls:v2',JSON.stringify(params()));}catch{}};
  const active=()=>root.isConnected&&isActive();
  function fit(){if(active())root.style.height=Math.max(310,window.innerHeight-root.getBoundingClientRect().top-2)+'px';}
  function pageSize(){return window.innerWidth<690?2:4;}
  function urlFor(kind){return kind==='ideas'?'/api/activities?mode='+encodeURIComponent(state.mode):
    '/api/activities/discover?kind='+kind+'&mode='+encodeURIComponent(state.mode);}
  function controls(){
    for(const b of root.querySelectorAll('[data-mode-choice]'))b.classList.toggle('selected',b.dataset.modeChoice===state.mode);
    for(const b of root.querySelectorAll('[data-env]'))b.classList.toggle('selected',b.dataset.env===state.environment);
    for(const b of root.querySelectorAll('[data-kind]')){
      const on=b.dataset.kind===state.kind;b.classList.toggle('selected',on);b.setAttribute('aria-selected',String(on));
    }
    q('#count-adults').textContent=state.adults;q('#count-kids').textContent=state.kids;
    q('#ideas-budget').value=state.budget;
    refresh.textContent=state.busy?'⏳ Checking…':state.kind==='ideas'?'↻ Refresh Ideas':state.kind==='events'?'↻ Find Events':'↻ Find Movies';
    refresh.disabled=state.busy;
    caption.textContent=state.kind==='ideas'?'📍 Max 20 km by road · Google Maps · Admission costs unverified':
      state.kind==='events'?'🎟 Events today · Official source links · Max 20 km':
      '🎬 Canadian releases this month · Showtimes must be verified';
    q('#ideas-clock').textContent=fmt();
  }
  function message(title,description){
    const box=el('div','activities-message');
    box.append(el('h2','',title),el('p','',description));
    if(state.error)box.append(el('p','activities-error',state.error));
    if(state.kind==='events'){
      const a=link('Ottawa Tourism events calendar','https://ottawatourism.ca/en/event-calendar');a.className='activities-source';box.append(a);
    }
    grid.append(box);
  }
  function link(title,url){
    const a=el('a','',title);a.href=URLSAFE(url)||'https://ottawatourism.ca/en/event-calendar';
    a.target='_blank';a.rel='noopener noreferrer';return a;
  }
  function photoFor(item,holder,mode){
    holder.append(el('span','activities-photo-placeholder',ICON[item.category]||'✨'));
    if(!item.id)return;
    const apply=data=>{
      if(!holder.isConnected||!data?.url)return;
      const url=URLSAFE(data.url);if(!url)return;
      const img=el('img');img.src=url;img.alt=item.name+' photo';img.loading='lazy';
      holder.prepend(img);holder.querySelector('.activities-photo-placeholder')?.remove();
      const credit=el('span','activities-photo-credit','Photo: ');
      const people=data.credits||[];
      if(!people.length)credit.append(document.createTextNode('Google Maps'));
      people.forEach((p,i)=>{
        if(i)credit.append(document.createTextNode(', '));
        if(URLSAFE(p.uri)){const a=link(p.name,p.uri);a.addEventListener('click',e=>e.stopPropagation(),{signal});credit.append(a);}
        else credit.append(document.createTextNode(p.name));
      });
      if(URLSAFE(data.sourceUrl)){
        credit.append(document.createTextNode(' · '));
        const a=link('source',data.sourceUrl);a.addEventListener('click',e=>e.stopPropagation(),{signal});credit.append(a);
      }
      holder.append(credit);
    };
    const key=mode+':'+item.id;
    if(state.photos.has(key)){apply(state.photos.get(key));return;}
    fetch('/api/activities/photo?placeId='+encodeURIComponent(item.id)+'&mode='+mode,{credentials:'same-origin',signal})
      .then(r=>r.ok?r.json():null).then(data=>{if(data?.url)state.photos.set(key,data);apply(data);}).catch(()=>{});
  }
  function closeModal(){state.modal?.remove();state.modal=null;}
  async function feedback(item,value,modalStatus){
    try{
      const r=await fetch('/api/activities/feedback',{method:'POST',credentials:'same-origin',signal,
        headers:{'content-type':'application/json'},body:JSON.stringify({
          id:item.id,category:item.category,mode:state.mode,value
        })});
      const d=await r.json();if(!r.ok)throw Error(d.error||'Feedback failed');
      state.feedback.set(state.mode+':'+item.id,value);
      modalStatus.textContent='Saved: '+(value==='like'?'Liked':value==='dislike'?'Not interested':'Visited')+
        ' · Future ideas will consider this.';
    }catch(e){modalStatus.textContent='Could not save: '+(e.message||'Try again');}
  }
  function details(item){
    closeModal();
    const backdrop=el('div','activities-modal-backdrop'),panel=el('div','activities-modal');
    panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
    panel.setAttribute('aria-label','Activity details');
    panel.append(el('h2','',(ICON[item.category]||'✨')+' '+item.name));
    const lines=item.kind==='movies'?[
      '🍿 Canadian theatrical release: '+item.releaseDate,
      '🎫 Canadian / Ontario rating: '+item.rating,
      '🕒 Showtimes at local cinemas: Not verified',
      '✨ '+(item.reason||'See source for details')
    ]:item.kind==='events'?[
      '📆 '+item.date+' · '+item.time+' (Ottawa local time)',
      '📍 '+item.venue+' · '+item.address,
      '🚗 '+item.km+' km · '+item.driveMinutes+' min from home (estimated)',
      '✨ '+(item.reason||'Check the official organizer')
    ]:[
      '📍 '+(item.address||'Location unverified'),
      '🚗 '+item.km+' km · '+item.driveMinutes+' min from home',
      '🕒 '+item.bestTime+' · '+(item.hoursVerified?'Hours checked':'Hours unverified'),
      '🌤 '+item.weather,
      '🎒 Bring: '+item.bring,
      '✨ '+item.reason,
      '💰 Admission for your group: Not verified',
      '⏰ Published hours: '+item.openingHours
    ];
    lines.forEach(x=>panel.append(el('p','',x)));
    const actions=el('div','activities-modal-actions');
    if(item.kind==='ideas'||item.kind==='events'){
      const mapUrl=item.kind==='events'?
        'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(item.address):
        'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(item.name+', '+item.address)+'&destination_place_id='+encodeURIComponent(item.id);
      actions.append(link('🗺 Directions',mapUrl));
    }
    if(item.kind==='ideas'){
      if(URLSAFE(item.website))actions.append(link('🌐 Website / admission',item.website));
      if(URLSAFE(item.mapsUrl))actions.append(link('Google Maps',item.mapsUrl));
    }else if(URLSAFE(item.sourceUrl)){
      actions.append(link('🔗 Verified source',item.sourceUrl));
      if(item.kind==='movies')actions.append(link('🎟 Ottawa showtimes','https://www.tribute.ca/showtimes/movie/ontario/ottawa/'));
    }
    if(item.kind==='ideas'){
      const note=el('p','activities-modal-tip','Help What to Do learn your preferences.');
      panel.append(note);
      const group=el('div','activities-feedback');
      for(const [value,label] of [['like','♡ Like'],['dislike','✕ Not interested'],['visited','✓ Visited']]){
        const b=el('button','',label);b.type='button';
        b.addEventListener('click',()=>feedback(item,value,status),{signal});group.append(b);
      }
      panel.append(group);
      var status=el('p','activities-modal-tip','');
      panel.append(status);
    }
    const close=el('button','activities-close','Close');close.type='button';
    close.addEventListener('click',closeModal,{signal});actions.append(close);
    panel.append(actions,el('p','activities-modal-tip','Check official opening hours, tickets and prices before leaving.'));
    backdrop.append(panel);
    backdrop.addEventListener('click',e=>{if(e.target===backdrop)closeModal();},{signal});
    document.body.append(backdrop);state.modal=backdrop;close.focus();
  }
  function card(item){
    const article=el('article','activities-card');article.tabIndex=0;article.setAttribute('role','button');
    article.setAttribute('aria-label',item.name+' – details');
    article.addEventListener('click',e=>{if(e.target.closest('a'))return;details(item);},{signal});
    article.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();details(item);}},{signal});
    const photo=el('div','activities-photo');
    if(item.kind==='ideas')photoFor(item,photo,state.mode);
    else photo.append(el('span','activities-photo-placeholder',item.kind==='movies'?'🎬':'🎟️'));
    const content=el('div','activities-description');
    const heading=el('div','activities-heading');
    heading.append(el('strong','activities-name',item.name),
      el('span','activities-type',item.kind==='movies'?item.rating:item.kind==='events'?'EVENT':item.category.toUpperCase()));
    content.append(heading);
    if(item.kind==='movies'){
      content.append(el('div','activities-line','📅 Canada release: '+item.releaseDate),
        el('div','activities-line','🎫 Rating: '+item.rating+' · Local showtimes not verified'),
        el('div','activities-line',item.reason||'Open for release details'));
    }else if(item.kind==='events'){
      content.append(el('div','activities-line','📆 Today · '+item.time+' · '+item.venue),
        el('div','activities-line','📍 '+item.km+' km / '+item.driveMinutes+' min by car'),
        el('div','activities-line',item.reason||'See the organizer'));
    }else{
      content.append(el('div','activities-line','🎒 '+item.bring),
        el('div','activities-line','🕒 '+item.bestTime+' · '+item.weather),
        el('div','activities-line','🚗 '+item.km+' km · '+item.driveMinutes+' min · '+(item.hoursVerified?'Hours checked':'Check hours')));
    }
    article.append(photo,content);return article;
  }
  function render(){
    if(!active())return;
    controls();fit();grid.replaceChildren();
    const arr=state.items,pageSizeNow=pageSize(),max=Math.max(1,Math.ceil(arr.length/pageSizeNow));
    state.page=Math.max(0,Math.min(max-1,state.page));
    if(state.busy)message('Finding '+types[state.kind].toLowerCase()+'…','Checking up-to-date sources, available time and family preferences.');
    else if(!arr.length)message(state.error?'Recommendations unavailable':'No saved '+types[state.kind].toLowerCase(),
      'Press Refresh to find ideas for this mode. Nothing is generated automatically.');
    else arr.slice(state.page*pageSizeNow,(state.page+1)*pageSizeNow).forEach(i=>grid.append(card(i)));
    pageLabel.textContent=(state.page+1)+' / '+max;
    q('#ideas-prev').disabled=state.page===0||state.busy;
    q('#ideas-next').disabled=state.page>=max-1||state.busy;
    const last=state.snapshot?.generatedAt;
    const mismatch=state.kind==='ideas'&&state.snapshot?.options&&
      ['adults','kids','budget','environment'].some(k=>state.snapshot.options[k]!==state[k]);
    meta.textContent=(last?'Saved '+stamp(last)+(mismatch?' · Filters changed; press Refresh':''):'Not generated')+
      (state.error&&arr.length?' · '+state.error:'');
  }
  async function load(){
    if(!active())return;
    const selectedKind=state.kind,selectedMode=state.mode;
    state.error='';state.items=[];state.snapshot=null;state.page=0;render();
    try{
      const r=await fetch(urlFor(selectedKind),{cache:'no-store',credentials:'same-origin',signal});
      const d=await r.json();if(!r.ok)throw Error(d.error||'Unable to load saved ideas');
      if(!active()||state.kind!==selectedKind||state.mode!==selectedMode)return;
      state.snapshot=d;state.items=(d.items||[]).map(x=>({...x,kind:selectedKind}));
      state.page=0;
    }catch(e){if(active())state.error=e.message||'Load failed';}
    render();
  }
  async function loadFeedback(){
    try{
      const r=await fetch('/api/activities/feedback',{credentials:'same-origin',signal});
      if(!r.ok)return;
      const d=await r.json();
      for(const x of d.records||[])state.feedback.set(x.mode+':'+x.id,x.value);
    }catch{}
  }
  async function generate(){
    if(state.busy)return;
    state.busy=true;state.error='';const kind=state.kind,mode=state.mode;render();
    try{
      const target=kind==='ideas'?'/api/activities/generate':'/api/activities/discover';
      const r=await fetch(target,{method:'POST',credentials:'same-origin',cache:'no-store',signal,
        headers:{'content-type':'application/json'},body:JSON.stringify({...params(),kind})});
      const d=await r.json();if(!r.ok)throw Error(d.error||'Generation failed');
      if(state.mode!==mode||state.kind!==kind)return;
      state.snapshot=d;state.items=(d.items||[]).map(x=>({...x,kind}));
      state.photos.clear();state.page=0;
    }catch(e){state.error=e.message||'Generation failed. Old results are still stored.';}
    finally{state.busy=false;render();}
  }
  for(const btn of root.querySelectorAll('[data-mode-choice]'))btn.addEventListener('click',()=>{
    if(state.busy)return;
    state.mode=btn.dataset.modeChoice;Object.assign(state,defaults[state.mode]);persist();load();
  },{signal});
  for(const btn of root.querySelectorAll('[data-kind]'))btn.addEventListener('click',()=>{
    if(state.busy)return;
    state.kind=btn.dataset.kind;load();
  },{signal});
  for(const btn of root.querySelectorAll('[data-env]'))btn.addEventListener('click',()=>{
    state.environment=btn.dataset.env;persist();render();
  },{signal});
  for(const btn of root.querySelectorAll('[data-count]'))btn.addEventListener('click',()=>{
    const type=btn.dataset.count,step=Number(btn.dataset.step);
    state[type]=Math.max(type==='adults'?1:0,Math.min(type==='adults'?8:10,state[type]+step));persist();render();
  },{signal});
  q('#ideas-budget').addEventListener('change',e=>{state.budget=e.target.value;persist();render();},{signal});
  refresh.addEventListener('click',generate,{signal});
  q('#ideas-prev').addEventListener('click',()=>{state.page--;render();},{signal});
  q('#ideas-next').addEventListener('click',()=>{state.page++;render();},{signal});
  window.addEventListener('resize',render,{signal});
  window.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();},{signal});
  cleanup=()=>{closeModal();ctrl.abort();};
  render();loadFeedback();load();
 }
};
})();
