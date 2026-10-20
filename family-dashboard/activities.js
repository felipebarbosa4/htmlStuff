(function(){
'use strict';
const EMOJI={park:'🌳',indoor:'🤸',museum:'🏛️',recreation:'🏊',library:'📚',animals:'🐾'};
const cleanLink=s=>{try{const u=new URL(s);return u.protocol==='https:'?u.href:'';}catch{return '';}};
const element=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const dateTime=s=>{if(!s)return 'Never';const d=new Date(s);return Number.isFinite(d.valueOf())?
  new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(d):'Unknown';};
let cleanup=null;
window.ActivitiesPanel={
  destroy(){if(cleanup){cleanup();cleanup=null;}},
  mount(host,isActive) {
    this.destroy();
    const control=new AbortController(),signal=control.signal;
    const root=element('section','activities-root');
    root.setAttribute('aria-label','Family activity recommendations');
    host.appendChild(root);
    root.innerHTML='<div class="activities-top"><div><h1>✨ What to Do</h1><div class="activities-sub" id="ideas-meta">Activities for Luna, Apollo & family</div></div><button type="button" class="activities-refresh" id="ideas-refresh">↻ Refresh Ideas</button></div><div class="activities-grid" id="ideas-grid" aria-live="polite"></div><div class="activities-footer"><span>📍 Within 20 km of home · Drive time from home</span><div class="activities-pages"><button class="activities-page-btn" id="ideas-prev" aria-label="Previous recommendations">‹</button><span id="ideas-page">1 / 2</span><button class="activities-page-btn" id="ideas-next" aria-label="Next recommendations">›</button></div></div>';
    const grid=root.querySelector('#ideas-grid'),meta=root.querySelector('#ideas-meta'),refresh=root.querySelector('#ideas-refresh');
    const prev=root.querySelector('#ideas-prev'),next=root.querySelector('#ideas-next'),pageLabel=root.querySelector('#ideas-page');
    let items=[],saved=null,page=0,busy=false,error='',modal=null;
    const images=new Map();
    function fit(){if(!root.isConnected)return;root.style.height=Math.max(320,window.innerHeight-root.getBoundingClientRect().top-2)+'px';}
    function pagesize(){return window.innerWidth<=720?2:4;}
    function setMessage(title,detail){
      grid.replaceChildren();
      const box=element('div','activities-message'),h=element('h2','',title);
      box.append(h,element('p','',detail));
      if(error)box.append(element('p','activities-error',error));
      grid.append(box);
    }
    function photoFor(id,container,mapsUrl) {
      const finish=data=>{
        if(!container.isConnected||!data?.url)return;
        const url=cleanLink(data.url);if(!url)return;
        const img=element('img');img.alt='Photo of the activity';img.loading='lazy';img.src=url;
        const previous=container.querySelector('.activities-photo-placeholder');if(previous)previous.remove();
        container.prepend(img);
        const names=(data.credits||[]).map(c=>c.name).filter(Boolean);
        const credit=element('span','activities-photo-credit',names.length?'Photo: '+names.join(', '):'Photo: Google Places');
        container.append(credit);
      };
      if(images.has(id)){finish(images.get(id));return;}
      fetch('/api/activities/photo?placeId='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store',signal})
        .then(r=>r.ok?r.json():null).then(data=>{if(data?.url)images.set(id,data);finish(data);}).catch(()=>{});
    }
    function link(label,url) {
      const a=element('a','',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;
    }
    function closeModal(){if(modal){modal.remove();modal=null;}}
    function showDetails(item) {
      closeModal();
      modal=element('div','activities-modal-backdrop');
      const panel=element('div','activities-modal');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
      panel.setAttribute('aria-label','Activity details');
      panel.append(element('h2','',(EMOJI[item.category]||'✨')+' '+item.name));
      const lines=[
        '📍 '+(item.address||'Address unavailable'),
        '🚗 '+item.km+' km · '+item.driveMinutes+' min from home (estimated)',
        '🕒 '+item.bestTime+' · '+(item.hoursVerified?'Opening hours checked':'Verify opening hours before leaving'),
        '🎒 Bring: '+item.bring,
        '✨ '+item.reason,
        '💰 Price for your family: '+item.price,
        '🌦 '+item.weather,
        '📅 Published hours: '+item.openingHours
      ];
      lines.forEach(s=>panel.append(element('p','',s)));
      const actions=element('div','actions');
      const destination='https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(item.name+', '+item.address)
        +'&destination_place_id='+encodeURIComponent(item.id);
      actions.append(link('🗺 Directions',destination));
      const web=cleanLink(item.website);if(web)actions.append(link('🌐 Website / Prices',web));
      const maps=cleanLink(item.mapsUrl);if(maps)actions.append(link('📌 Google listing',maps));
      const close=element('button','activities-close','Close');close.type='button';close.addEventListener('click',closeModal,{signal});actions.append(close);
      panel.append(actions);
      const note=element('p','activities-sub','Hours and prices can change. Driving estimate starts from home; Maps may use your current location.');
      panel.append(note);modal.append(panel);modal.addEventListener('click',e=>{if(e.target===modal)closeModal();},{signal});
      document.body.append(modal);close.focus();
    }
    function makeCard(item) {
      const card=element('article','activities-card');card.tabIndex=0;card.setAttribute('role','button');
      card.setAttribute('aria-label',item.name+', show details');
      card.addEventListener('click',()=>showDetails(item),{signal});
      card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();showDetails(item);}},{signal});
      const photo=element('div','activities-photo');photo.append(element('span','activities-photo-placeholder',EMOJI[item.category]||'✨'));
      const desc=element('div','activities-description'),heading=element('div','activities-heading');
      heading.append(element('span','activities-name',item.name),element('span','activities-type',(item.category||'Activity').toUpperCase()));
      desc.append(heading);
      const a=element('div','activities-line');a.append(element('strong','', '🎒 Bring: '),document.createTextNode(item.bring));
      const b=element('div','activities-line');b.append(element('strong','', '🕒 Best: '),document.createTextNode(item.bestTime+' · '+item.weather));
      const c=element('div','activities-line');c.append(element('span','activities-distance','🚗 '+item.km+' km · '+item.driveMinutes+' min'),document.createTextNode('  ·  '+(item.hoursVerified?'Hours checked':'Check hours')));
      desc.append(a,b,c);card.append(photo,desc);
      photoFor(item.id,photo,item.mapsUrl);
      return card;
    }
    function draw(){
      if(!isActive()||!root.isConnected)return;
      fit();
      meta.textContent=saved?.generatedAt?'Saved '+dateTime(saved.generatedAt)+' · For '+(saved.date||'today')+' · '+(saved.provider||'AI'):'Family ideas · On-demand only';
      if(busy){setMessage('Finding family adventures…','Checking weather, calendar, real driving distances and AI recommendations.');}
      else if(!items.length){setMessage(error?'Recommendations unavailable':'No recommendations saved','Press Refresh Ideas to generate activities for your family.');}
      else{
        grid.replaceChildren();
        const size=pagesize(),count=Math.max(1,Math.ceil(items.length/size));
        page=Math.min(page,count-1);
        items.slice(page*size,(page+1)*size).forEach(item=>grid.append(makeCard(item)));
      }
      const count=Math.max(1,Math.ceil(items.length/pagesize()));
      pageLabel.textContent=(page+1)+' / '+count;prev.disabled=page<=0||busy;next.disabled=page>=count-1||busy;
      refresh.disabled=busy;refresh.textContent=busy?'⏳ Finding ideas…':'↻ Refresh Ideas';
    }
    async function load(){
      try{
        const response=await fetch('/api/activities',{credentials:'same-origin',cache:'no-store',signal});
        const payload=await response.json();
        if(!response.ok)throw Error(payload.error||'Could not load saved ideas');
        saved=payload;items=Array.isArray(saved.items)?saved.items:[];error='';
      }catch(e){error=e.message||'Unable to load';}
      draw();
    }
    async function generate(){
      if(busy)return;
      busy=true;error='';draw();
      try{
        const response=await fetch('/api/activities/generate',{method:'POST',
          headers:{'content-type':'application/json'},body:'{}',credentials:'same-origin',cache:'no-store',signal});
        if(!response.headers.get('content-type')?.includes('application/json'))throw Error('Dashboard session expired; sign in again.');
        const payload=await response.json();
        if(!response.ok)throw Error(payload.error||'Refresh failed');
        saved=payload;items=Array.isArray(payload.items)?payload.items:[];page=0;images.clear();
      }catch(e){error=e.message||'Refresh failed; saved activities remain available.';}
      finally{busy=false;draw();if(error&&items.length)meta.textContent='Refresh failed: '+error+' · Showing previous ideas';}
    }
    refresh.addEventListener('click',generate,{signal});
    prev.addEventListener('click',()=>{page--;draw();},{signal});
    next.addEventListener('click',()=>{page++;draw();},{signal});
    window.addEventListener('resize',draw,{signal});
    window.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();},{signal});
    cleanup=()=>{closeModal();control.abort();};
    fit();draw();load();
  }
};
})();
