(function(){
'use strict';
const TZ='America/Toronto';
const ICON={park:'🌳',indoor:'🤸',museum:'🏛️',recreation:'🏊',library:'📚',animals:'🐾',food:'🍽️',culture:'🎭',cinema:'🎬',landmark:'🏛️'};
const URLSAFE=url=>{try{const u=new URL(url);return u.protocol==='https:'?u.href:'';}catch{return '';}};
// Only a real YouTube trailer ID returned by TMDB may be embedded.
// No arbitrary URL or HTML is accepted inside an iframe.
const trailerId=url=>{
  try{
    const u=new URL(url);
    if(u.protocol!=='https:')return '';
    const host=u.hostname.toLowerCase();
    const id=(['www.youtube.com','youtube.com','m.youtube.com'].includes(host)&&u.pathname==='/watch')?
      u.searchParams.get('v'):(host==='youtu.be'&&/^\/[A-Za-z0-9_-]{11}$/.test(u.pathname)?u.pathname.slice(1):'');
    return /^[A-Za-z0-9_-]{11}$/.test(id||'')?id:'';
  }catch{return '';}
};
const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
const dayLabel=s=> /^\d{4}-\d{2}-\d{2}$/.test(s||'')?new Intl.DateTimeFormat('en-CA',{timeZone:TZ,weekday:'short',month:'short',day:'numeric'}).format(new Date(s+'T12:00:00Z')):'Selected day';
const dayLabelPt=s=> /^\d{4}-\d{2}-\d{2}$/.test(s||'')?
  new Intl.DateTimeFormat('pt-BR',{timeZone:TZ,weekday:'short',day:'numeric',month:'short'}).format(new Date(s+'T12:00:00Z')):'dia selecionado';
const clockPt=s=>String(s||'').replace(/\b(1[0-2]|0?[1-9]):([0-5]\d)\s*(AM|PM)\b/gi,(_m,h,m,period)=>{
  const hour=(Number(h)%12)+(period.toUpperCase()==='PM'?12:0);
  return hour+'h'+(m==='00'?'':m);
});
const dayHoursPt=s=>clockPt(String(s||'Horário não confirmado')
  .replace(/Opening hours unverified|Hours unverified/gi,'Horário não confirmado')
  .replace(/Closed on selected day[^/]*/gi,'Fechado na data selecionada')
  .replace(/Open 24 hours/gi,'Aberto 24 horas')
  .replace(/Hours for that date unavailable[^/]*/gi,'Horário indisponível para esta data'));
const departurePt=s=>clockPt(String(s||'').replace(/^Leave at /,'Sair às ')
  .replace(/^No confirmed slot right now.*$/i,'Sem horário confirmado agora — atualize as ideias')
  .replace(/^Refresh Ideas.*$/i,'Atualize as ideias para conferir o horário'));
const weatherPt=s=>String(s||'').replace(/rain\s*/gi,'chuva ').replace(/Forecast unavailable/gi,'Previsão indisponível');
const moneyPt=n=>'C$ '+new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
const admissionPt=p=>p?.perPerson===0?'Entrada gratuita (confirmada)':
  Number.isFinite(p?.perPerson)?'≈ '+moneyPt(p.perPerson)+'/pessoa (ingresso)':'Ingresso não confirmado';

const watchNames=x=>(Array.isArray(x)?x:[]).join(', ');
const movieScore=x=>Number.isInteger(x?.userScorePercent)&&x.userScorePercent>=0&&x.userScorePercent<=100&&
  Number.isInteger(x.userScoreVotes)&&x.userScoreVotes>0?x.userScorePercent:null;
const movieSynopsis=x=>x?.metadataVersion>=2&&x?.synopsisLocale==='pt-BR'?
  x.synopsis||'Sinopse ainda não disponível em português na TMDB.':
  'Clique em Find Movies para carregar a sinopse em português.';

const stamp=s=>{const t=Date.parse(s);return Number.isFinite(t)?new Intl.DateTimeFormat('en-CA',{timeZone:TZ,month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(t):'Not generated'};
const fmt=()=>{
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,weekday:'short',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date());
 return parts;
};
const types={ideas:'Ideas',events:'Events Today',movies:'Movies This Month',home:'At Home'};
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
  root.innerHTML=`<div class="activities-top"><div><h1>✨ What to Do</h1><div class="activities-sub"><span id="ideas-clock"></span> · Ottawa · <span id="ideas-status">On demand</span></div></div><button id="ideas-refresh" type="button" class="activities-refresh">↻ Refresh Ideas</button></div>
  <div class="activities-controls">
    <div class="activities-modes" role="group" aria-label="Outing type"><button data-mode-choice="couple">❤️ Couple</button><button data-mode-choice="family">👨‍👩‍👧‍👦 Family</button><button data-mode-choice="visits">🏠 Visits</button></div>
    <div class="activities-filters">
      <div class="activities-kids" role="group" aria-label="Incluir crianças"><span>Crianças</span><button type="button" data-kids="yes">✓ Sim</button><button type="button" data-kids="no">Não</button></div>
      <label class="activities-select activities-budget">Orçamento<select id="ideas-budget" aria-label="Budget"><option value="free">Grátis</option><option value="under100">Até C$100</option><option value="any">Sem limite</option></select></label><label class="activities-select activities-distance">Distância<select id="ideas-distance" aria-label="Maximum driving distance"><option value="5">5 km</option><option value="10">10 km</option><option value="20">20 km</option><option value="30">30 km</option><option value="50">50 km</option></select></label>
      <div class="activities-env" role="group" aria-label="Activity environment"><button data-env="all">Ambos</button><button data-env="indoor">Indoor</button><button data-env="outdoor">Outdoor</button></div>
    </div>
    <div class="activities-tabs" role="tablist" aria-label="Recommendations sections"><button role="tab" data-kind="ideas">✨ Ideas</button><button role="tab" data-kind="events">🎟 Events</button><button role="tab" data-kind="movies">🎬 Movies</button><button role="tab" data-kind="home">🏠 At Home</button></div>
  </div>
  <div class="activities-carousel" id="ideas-grid" tabindex="0" aria-label="Deslize horizontalmente para ver mais recomendações" aria-live="polite"><div class="activities-track" id="ideas-track"></div></div>
  <div class="activities-footer"><span id="ideas-caption">📍 20 km by road · Google Maps</span><div class="activities-pages"><span id="ideas-page">Deslize ← → · 1 / 1</span></div></div>`;
  const q=s=>root.querySelector(s),grid=q('#ideas-grid'),track=q('#ideas-track'),meta=q('#ideas-status'),refresh=q('#ideas-refresh');
  const pageLabel=q('#ideas-page'),caption=q('#ideas-caption');
  const state={
    mode:['couple','family','visits'].includes(savedControls.mode)?savedControls.mode:'family',
    budget:['free','under100','any'].includes(savedControls.budget)?savedControls.budget:'any',
    environment:['all','indoor','outdoor'].includes(savedControls.environment)?savedControls.environment:'all',
    maxKm:[5,10,20,30,50].includes(Number(savedControls.maxKm))?Number(savedControls.maxKm):20,
    kind:'ideas',adults:2,kids:2,items:[],snapshot:null,
    homeRotation:(()=>{try{return Math.max(0,Number(localStorage.getItem('family:activities:home:rotation')||0));}catch{return 0;}})(),
    page:0,error:'',busy:false,feedback:new Map(),modal:null
  };
  Object.assign(state,defaults[state.mode]);
  if(Number.isInteger(savedControls.adults))state.adults=Math.max(1,Math.min(8,savedControls.adults));
  if(Number.isInteger(savedControls.kids))state.kids=Math.max(0,Math.min(10,savedControls.kids));
  if(state.mode==='couple')state.kids=0;
  const params=()=>({mode:state.mode,adults:state.adults,kidsYes:state.mode!=='couple'&&state.kids>0,kids:state.mode==='couple'?0:state.kids,budget:state.budget,environment:state.environment,maxKm:state.maxKm});
  const persist=()=>{try{localStorage.setItem('family:activities:controls:v2',JSON.stringify(params()));}catch{}};
  const active=()=>root.isConnected&&isActive();
  function fit(){if(active())root.style.height=Math.max(0,window.innerHeight-root.getBoundingClientRect().top-2)+'px';}
  function pageSize(){
    const available=grid.getBoundingClientRect().height;
    // Movies are a compact two-column grid; reserve at least ~130px per row.
    // A full tablet gets 4 films (2 x 2) or 6 (2 x 3) per page.
    if(state.kind==='movies'){
      const columns=window.innerWidth>=740?2:1;
      const rows=available>=570?3:available>=280?2:1;
      return columns*rows;
    }
    if(state.kind==='home')return window.innerWidth>=740&&available>=280?4:available>=180?2:1;
    if(state.kind==='ideas'){
      // Two columns by two rows on tablets. Small landscape phone views
      // gracefully fall back rather than clipping the 7 information lines.
      return window.innerWidth>=740&&available>=320?4:available>=200?2:1;
    }
    return available<240?1:2;
  }
  const kidSafeMovie=x=>['G','PG'].includes(String(x?.rating||'').trim().toUpperCase());
  const visibleMovies=items=>state.kids>0?items.filter(kidSafeMovie):items;
  const homeItems=()=>window.HomeIdeas?.generate({kids:state.mode!=='couple'&&state.kids>0,mode:state.mode,rotation:state.homeRotation})||[];
  // This does NOT search for a new title. It only uses the family's already
  // saved Canadian G/PG movie listing when streaming is explicitly listed.
  const homeMovie=films=>{
    if(state.mode==='couple')return null;
    const best=(Array.isArray(films)?films:[]).filter(x=>(state.kids===0||kidSafeMovie(x))&&
      x.watch?.verified===true&&(x.watch?.subscription?.length||x.watch?.free?.length)&&URLSAFE(x.sourceUrl))
      .sort((a,b)=>Number(b.rating==='G')-Number(a.rating==='G'))[0];
    if(!best)return null;
    const service=[...(best.watch.subscription||[]),...(best.watch.free||[])].slice(0,2).join(', ');
    return {id:'home:stream:'+best.id,kind:'home',name:'Cinema: '+best.name,icon:'🎬',
      duration:110,bring:'Pipoca, cobertor e acesso ao serviço informado',
      why:'Filme '+best.rating+' que consta no catálogo canadense de '+service,
      steps:['Confirme se o título ainda está disponível em '+service,
        'Confira conteúdo e adequação para Apollo e Luna, especialmente se for PG',
        'Preparem pipoca e conversem sobre as cenas favoritas ao terminar'],
      sourceUrl:best.sourceUrl,posterUrl:best.posterUrl||'',category:'home'};
  };
  function urlFor(kind){return kind==='ideas'?'/api/activities?mode='+encodeURIComponent(state.mode):
    '/api/activities/discover?kind='+kind+'&mode='+encodeURIComponent(state.mode)+
      '&maxKm='+state.maxKm+'&kidsYes='+(state.kids>0?'true':'false');}
  function controls(){
    root.classList.toggle('activities-movies',state.kind==='movies');
    root.classList.toggle('activities-ideas',state.kind==='ideas');
    root.classList.toggle('activities-home',state.kind==='home');
    root.classList.toggle('activities-events',state.kind==='events');
    root.classList.toggle('activities-couple',state.mode==='couple');
    root.classList.toggle('activities-only-audience',state.kind==='home'||state.kind==='movies');
    for(const b of root.querySelectorAll('[data-mode-choice]'))b.classList.toggle('selected',b.dataset.modeChoice===state.mode);
    for(const b of root.querySelectorAll('[data-env]'))b.classList.toggle('selected',b.dataset.env===state.environment);
    for(const b of root.querySelectorAll('[data-kind]')){
      const on=b.dataset.kind===state.kind;b.classList.toggle('selected',on);b.setAttribute('aria-selected',String(on));
    }
    for(const b of root.querySelectorAll('[data-kids]'))b.classList.toggle('selected',(b.dataset.kids==='yes')===(state.kids>0));
    const kidsControl=root.querySelector('.activities-kids');
    kidsControl.hidden=state.mode==='couple';
    kidsControl.setAttribute('aria-hidden',String(state.mode==='couple'));
    kidsControl.querySelectorAll('button').forEach(b=>{b.disabled=state.mode==='couple';});
    q('#ideas-budget').value=state.budget;q('#ideas-distance').value=String(state.maxKm);
    refresh.textContent=state.busy?'⏳ Conferindo…':state.kind==='ideas'?'↻ Refresh Ideas':state.kind==='events'?'↻ Find Events':state.kind==='home'?'↻ Outras ideias':'↻ Find Movies';
    refresh.disabled=state.busy;
    caption.textContent=state.kind==='home'?'🏠 Guias completos no tablet · sem abrir páginas externas · sem custos de IA':
      state.kind==='ideas'?'📍 '+state.maxKm+' km by road · Google Maps location/hours · Admission sourced separately':
      state.kind==='events'?'🎟 Events today · '+state.maxKm+' km · Data: Has Things (ODbL 1.0)':
      '🎬 Canadian releases: this month + recent · This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.';
    caption.replaceChildren(document.createTextNode(caption.textContent));
    if(state.kind==='movies'){
      const logo=el('img','activities-tmdb-logo');
      logo.src='https://www.themoviedb.org/assets/2/v4/logos/v2/blue_long_2-9665a76b1ae401a510ec1e0ca40ddcb3b0cfe45f1d51b77a308fea0845885648.svg';
      logo.alt='TMDB';logo.loading='lazy';
      const a=link('TMDB information','https://www.themoviedb.org/about/logos-attribution');
      a.className='activities-credit-link';a.textContent='';a.append(logo);
      a.title='This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.';
      caption.append(document.createTextNode(' · '),a);
      const justwatch=link('Streaming data: JustWatch','https://www.justwatch.com/ca');
      justwatch.className='activities-credit-link';caption.append(document.createTextNode(' · '),justwatch);
    }
    if(state.kind==='events'){
      const a=link('Has Things license','https://ottawa.hasthings.com/feeds#license');
      a.className='activities-credit-link';a.textContent='License ↗';
      caption.append(document.createTextNode(' · '),a);
    }
    q('#ideas-clock').textContent=fmt();
  }
  function message(title,description){
    const box=el('div','activities-message');
    box.append(el('h2','',title),el('p','',description));
    if(state.error)box.append(el('p','activities-error',state.error));
    if(state.kind==='events'){
      const a=link('Ottawa Tourism events calendar','https://ottawatourism.ca/en/event-calendar');a.className='activities-source';box.append(a);
    }
    track.firstElementChild?.append(box);
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
      const img=el('img');img.alt='Photo of '+item.name;img.loading='eager';img.referrerPolicy='no-referrer';
      img.addEventListener('load',()=>holder.querySelector('.activities-photo-placeholder')?.remove(),{once:true});
      img.addEventListener('error',()=>{img.remove();
        holder.append(el('span','activities-photo-unavailable','Photo unavailable'));},{once:true});
      holder.prepend(img);img.src=url;
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
    // Never cache Google Places photo URLs/names; only keep the already-rendered
    // <img> element alive while switching tablet panels.
    fetch('/api/activities/photo?placeId='+encodeURIComponent(item.id)+'&mode='+mode,{credentials:'same-origin',signal,cache:'no-store'})
      .then(async r=>{const data=await r.json();return r.ok?data:{error:data.error||'Photo unavailable'};})
      .then(data=>{if(data?.url)apply(data);
        else if(holder.isConnected)holder.append(el('span','activities-photo-unavailable','Photo not available'));
      }).catch(()=>{if(holder.isConnected)holder.append(el('span','activities-photo-unavailable','Photo unavailable'));});
  }
  function closeModal(){
    if(!state.modal)return;
    const before=state.modal._focusBefore;
    // Removing the entire iframe stops video/sound when the dialog closes.
    state.modal.remove();state.modal=null;
    if(before?.isConnected)before.focus({preventScroll:true});
  }
  function openTrailer(item){
    const id=trailerId(item?.trailerUrl);
    if(!id)return;
    const focused=document.activeElement;
    closeModal();
    const overlay=el('div','activities-modal-backdrop activities-trailer-backdrop');
    const panel=el('div','activities-modal activities-trailer-modal');
    panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
    panel.setAttribute('aria-label','Trailer: '+item.name);
    const header=el('div','activities-trailer-header');
    const title=el('h2','', '▶ '+item.name+' — Trailer');
    const close=el('button','activities-close activities-trailer-close','✕ Close');close.type='button';
    close.addEventListener('click',closeModal,{signal});
    header.append(title,close);
    const area=el('div','activities-trailer-player');
    const frame=el('iframe','activities-trailer-frame');
    frame.title='YouTube trailer for '+item.name;
    frame.src='https://www.youtube-nocookie.com/embed/'+id+'?playsinline=1&rel=0';
    frame.referrerPolicy='origin';
    frame.allow='accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
    frame.allowFullscreen=true;frame.loading='eager';
    area.append(frame);
    const text=el('p','activities-trailer-note',
      'Tap Play inside the video. If this tablet blocks YouTube embeds, use the alternative below.');
    // An explicit same-tab fallback works with kiosk browsers that block popups.
    const fallback=el('a','activities-trailer-fallback','▶ Open on YouTube in this tab');
    fallback.href='https://www.youtube.com/watch?v='+id;
    fallback.target='_self';fallback.rel='noopener noreferrer';
    panel.append(header,area,text,fallback);
    overlay.append(panel);
    overlay._focusBefore=focused;
    overlay.addEventListener('click',e=>{if(e.target===overlay)closeModal();},{signal});
    document.body.append(overlay);state.modal=overlay;
    close.focus({preventScroll:true});
  }
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
  function showHomeGuide(item){
    const focused=document.activeElement;
    closeModal();
    const backdrop=el('div','activities-modal-backdrop activities-home-backdrop');
    const panel=el('section','activities-modal activities-home-guide');
    panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
    panel.setAttribute('aria-label','Passo a passo: '+item.name);
    backdrop._focusBefore=focused;
    const header=el('div','activities-home-guide-header');
    const identity=el('div','activities-home-guide-identity');
    identity.append(el('span','activities-home-guide-icon',item.icon||'🏡'));
    const titles=el('div','activities-home-guide-titles');
    titles.append(el('span','activities-home-guide-kicker',item.audience==='couple'?'❤️ Encontro a dois':'🏠 Atividade em casa'),
      el('h2','',item.name));
    identity.append(titles);
    const close=el('button','activities-close activities-home-guide-close','✕ Fechar');
    close.type='button';close.addEventListener('click',closeModal,{signal});
    header.append(identity,close);
    const intro=el('div','activities-home-guide-summary');
    intro.append(el('div','','⏱ '+item.duration+' min'),el('div','','🎒 '+item.bring));
    const subtitle=el('p','activities-home-guide-reason','💡 '+item.why);
    const steps=el('ol','activities-home-guide-steps');
    (item.steps||[]).forEach((step,i)=>{
      const li=el('li');li.append(el('span','activities-home-step-number',String(i+1)),el('span','',step));steps.append(li);
    });
    const heading=el('h3','activities-home-guide-steps-title','Como fazer');
    const section=el('div','activities-home-guide-content');
    section.append(heading,steps);
    // Referenced educational material is attribution, never an outbound kiosk
    // navigation. Original step-by-step lives here on the tablet.
    const source=el('p','activities-home-guide-source','Ideia adaptada para o Family Dash');
    if(URLSAFE(item.sourceUrl)){
      const host=new URL(item.sourceUrl).hostname.replace(/^www\./,'');
      source.textContent='Inspiração e leitura complementar: '+host+' · sem sair do painel';
    }
    section.append(source);
    const vid=typeof item.videoId==='string'&&/^[A-Za-z0-9_-]{11}$/.test(item.videoId)?item.videoId:'';
    if(vid){
      const area=el('div','activities-home-guide-media');
      const play=el('button','activities-home-guide-play','▶ Assistir vídeo curto aqui');
      play.type='button';
      const box=el('div','activities-home-guide-video');
      play.addEventListener('click',()=>{
        if(box.querySelector('iframe'))return;
        const frame=el('iframe','activities-home-guide-frame');
        frame.title='Vídeo demonstrativo: '+item.name;
        frame.src='https://www.youtube-nocookie.com/embed/'+vid+'?playsinline=1&rel=0';
        frame.allow='accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
        frame.referrerPolicy='origin';frame.allowFullscreen=true;
        box.append(frame);play.hidden=true;
      },{signal});
      area.append(play,box,el('p','activities-home-guide-video-note',
        'Vídeo de referência (pode estar em outro idioma). Caso o player seja bloqueado, o guia acima continua disponível.'));
      section.append(area);
    }
    panel.append(header,intro,subtitle,section);
    backdrop.append(panel);
    backdrop.addEventListener('click',e=>{if(e.target===backdrop)closeModal();},{signal});
    document.body.append(backdrop);state.modal=backdrop;
    close.focus({preventScroll:true});
  }
  function details(item){
    if(item.kind==='home'){showHomeGuide(item);return;}
    closeModal();
    const backdrop=el('div','activities-modal-backdrop'),panel=el('div','activities-modal');
    panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
    panel.setAttribute('aria-label','Activity details');
    panel.append(el('h2','',(ICON[item.category]||'✨')+' '+item.name));
    const watch=item.watch||{},streaming=watchNames(watch.subscription),free=watchNames(watch.free);
    const where=!watch.verified?'Canadian streaming status not verified':
      streaming||free?[
        streaming?'Subscription: '+streaming:'',
        free?'Free / ad-supported: '+free:'',
        watchNames(watch.rent)?'Rent: '+watchNames(watch.rent):'',
        watchNames(watch.buy)?'Buy: '+watchNames(watch.buy):''
      ].filter(Boolean).join(' · '):
      'No Canadian streaming providers listed (check back later)';
    const lines=item.kind==='home'?[
      '⏱ Duração sugerida: '+item.duration+' min',
      '🎒 O que separar: '+item.bring,
      '💡 Por que fazer: '+item.why,
      ...item.steps.map((step,i)=>(i+1)+'. '+step),
      '📖 Sugestão inspirada em material educativo; adapte à idade e supervisione atividades.'
    ]:item.kind==='movies'?[
      '🍿 Estreia no Canadá: '+item.releaseDate,
      '🎫 Classificação etária canadense: '+item.rating,
      '⭐ Nota dos usuários TMDB: '+(movieScore(item)===null?'Ainda sem avaliações':movieScore(item)+'% ('+item.userScoreVotes+' votos)'),
      '📝 Sinopse: '+movieSynopsis(item),
      '📺 Watch in Canada: '+where,
      '🕒 Local cinema showtimes: Not verified',
      'ℹ Streaming information: JustWatch via TMDB; may change by date.',
      'ℹ This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.'
    ]:item.kind==='events'?[
      '📆 '+item.date+' · '+item.time+' (Ottawa local time)',
      '📍 '+item.venue+' · '+item.address,
      '🚗 '+item.km+' km · '+item.driveMinutes+' min from home (estimated)',
      '✨ '+(item.reason||'Check the official organizer'),
      '🔍 Source: '+(item.provider||'Event feed')+' · '+(item.ageRestriction||'Age suitability unverified'),
      '📚 Event listings: Has Things, ODbL 1.0 (for feed listings).'
    ]:[
      '📍 '+(item.address||'Endereço não confirmado'),
      '🚗 '+item.km+' km · '+item.driveMinutes+' min de carro',
      '🕒 '+departurePt(item.bestTime)+' · '+(item.hoursVerified?'Funcionamento conferido':'Horário não confirmado'),
      '🌤 '+weatherPt(item.weather),
      '🎒 Levar: '+item.bring,
      '✨ O que fazer: '+(item.highlights?.length?item.highlights.join(' · '):'Atividades ainda não confirmadas'),
      '🐾 Animais: '+(item.animals?.length?item.animals.join(', '):'Espécies não confirmadas'),
      '💡 Por que ir: '+(item.why||item.reason||'Confira o local'),
      '💰 Ingresso médio: '+admissionPt(item.price)+
        (item.price?.estimatedTotal!=null?' · Total estimado: '+moneyPt(item.price.estimatedTotal):''),
      '🏪 Funcionamento em '+dayLabelPt(item.hoursDate)+': '+dayHoursPt(item.hoursToday),
      'ℹ Horários publicados não garantem disponibilidade de atividades ou ingressos.'
    ];
    lines.forEach(x=>panel.append(el('p','',x)));
    const actions=el('div','activities-modal-actions');
    if(item.kind==='ideas'||item.kind==='events'){
      const mapUrl=item.kind==='events'?
        'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(item.address):
        'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(item.name+', '+item.address)+'&destination_place_id='+encodeURIComponent(item.id);
      actions.append(link('🗺 Directions',mapUrl));
    }
    if(item.kind==='home'&&URLSAFE(item.sourceUrl)){
      const a=link('📚 Ver fonte e ideias originais',item.sourceUrl);a.target='_self';actions.append(a);
    }
    if(item.kind==='ideas'){
      if(URLSAFE(item.website))actions.append(link('🌐 Website / admission',item.website));
      if(URLSAFE(item.mapsUrl))actions.append(link('Google Maps',item.mapsUrl));
      if(URLSAFE(item.sourceUrl))actions.append(link('📖 Fonte das atividades e ingressos',item.sourceUrl));
    }else if(URLSAFE(item.sourceUrl)){
      actions.append(link(item.kind==='movies'?'🎬 TMDB details':'🔗 Event source',item.sourceUrl));
      if(item.kind==='events'&&URLSAFE(item.ticketUrl))actions.append(link('🎟 Tickets / organizer',item.ticketUrl));
      if(item.kind==='movies'){
        if(trailerId(item.trailerUrl)){
          const play=el('button','activities-modal-play','▶ Assistir trailer aqui');play.type='button';
          play.addEventListener('click',()=>openTrailer(item),{signal});
          actions.prepend(play);
        }
        if(URLSAFE(item.watch?.link))actions.append(link('📺 Streaming options (CA)',item.watch.link));
        actions.append(link('🎟 Check Ottawa showtimes','https://www.tribute.ca/showtimes/movie/ontario/ottawa/'));
      }
    }
    if(item.kind==='ideas'){
      const note=el('p','activities-modal-tip','Ajude o What to Do a aprender suas preferências.');
      panel.append(note);
      const group=el('div','activities-feedback');
      for(const [value,label] of [['like','♡ Gostei'],['dislike','✕ Sem interesse'],['visited','✓ Já visitei']]){
        const b=el('button','',label);b.type='button';
        b.addEventListener('click',()=>feedback(item,value,status),{signal});group.append(b);
      }
      panel.append(group);
      var status=el('p','activities-modal-tip','');
      panel.append(status);
    }
    if(item.kind==='movies'){
      const by=link('Streaming availability supplied by JustWatch','https://www.justwatch.com/ca');
      by.className='activities-justwatch';panel.append(by);
    }
    const close=el('button','activities-close','Close');close.type='button';
    close.addEventListener('click',closeModal,{signal});actions.append(close);
    panel.append(actions,el('p','activities-modal-tip',item.kind==='ideas'?
      'Confira os horários, ingressos e preços oficiais antes de sair.':'Check official opening hours, tickets and prices before leaving.'));
    backdrop.append(panel);
    backdrop.addEventListener('click',e=>{if(e.target===backdrop)closeModal();},{signal});
    document.body.append(backdrop);state.modal=backdrop;close.focus();
  }
  function card(item){
    const article=el('article','activities-card');
    if(item.kind==='movies')article.classList.add('activities-card-movie');
    if(item.kind==='home')article.classList.add('activities-card-home');
    article.tabIndex=0;article.setAttribute('role','button');
    article.setAttribute('aria-label',item.name+' – details');
    article.addEventListener('click',e=>{if(e.target.closest('a'))return;details(item);},{signal});
    article.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();details(item);}},{signal});
    const photo=el('div','activities-photo');
    if(item.kind==='home'&&URLSAFE(item.posterUrl)){
      const img=el('img','activities-movie-poster');img.alt='Capa de '+item.name;img.src=item.posterUrl;photo.append(img);
    }else if(item.kind==='home')photo.append(el('span','activities-home-art',item.icon||'🏡'));
    else if(item.kind==='ideas')photoFor(item,photo,state.mode);
    else if(item.kind==='movies'&&URLSAFE(item.posterUrl)){
      const img=el('img','activities-movie-poster');img.alt='Poster for '+item.name;
      img.loading='lazy';img.referrerPolicy='no-referrer';
      img.addEventListener('error',()=>{img.remove();photo.append(el('span','activities-photo-placeholder','🎬'));},{once:true});
      img.src=item.posterUrl;photo.append(img);
    }else photo.append(el('span','activities-photo-placeholder',item.kind==='movies'?'🎬':'🎟️'));
    const content=el('div','activities-description');
    const heading=el('div','activities-heading');
    heading.append(el('strong','activities-name',item.name));
    if(item.kind==='movies'){
      const badges=el('div','activities-movie-badges');
      if(movieScore(item)!==null){
        const score=el('span','activities-score','★ '+movieScore(item)+'%');
        score.title='Nota média dos usuários TMDB ('+item.userScoreVotes+' votos), não classificação etária';
        score.setAttribute('aria-label','Nota dos usuários TMDB: '+movieScore(item)+' por cento');
        badges.append(score);
      }
      badges.append(el('span','activities-type',item.rating));
      heading.append(badges);
    }else heading.append(el('span','activities-type',item.kind==='events'?'EVENT':item.kind==='home'?'CASA':item.category.toUpperCase()));
    content.append(heading);
    if(item.kind==='movies'){
      content.append(el('div','activities-line','📅 Estreia no Canadá: '+item.releaseDate+' · '+item.rating));
      const streaming=watchNames(item.watch?.subscription),free=watchNames(item.watch?.free);
      content.append(el('div','activities-line',
        streaming||free?'📺 Canada: '+[streaming,free].filter(Boolean).join(' / '):
        '📺 '+(item.watch?.verified?'Not listed on Canadian streaming':'Streaming not verified')));
      if(trailerId(item.trailerUrl)){
        const play=el('button','activities-trailer-link');play.type='button';
        play.append(el('span','activities-play-icon','▶'),document.createTextNode(' Ver trailer'));
        play.addEventListener('click',e=>{e.stopPropagation();openTrailer(item);},{signal});
        content.append(play);
      }
      content.append(el('div','activities-line activities-synopsis',movieSynopsis(item)));
    }else if(item.kind==='home'){
      content.append(el('div','activities-line','⏱ '+item.duration+' min · '+item.why),
        el('div','activities-line','🎒 '+item.bring),
        el('div','activities-line activities-home-step','✨ '+item.steps[0]),
        el('div','activities-line','Toque para ver o passo a passo'));
    }else if(item.kind==='events'){
      content.append(el('div','activities-line','📆 Today · '+item.time+' · '+item.venue),
        el('div','activities-line','📍 '+item.km+' km / '+item.driveMinutes+' min by car'),
        el('div','activities-line',item.reason||'See the organizer'));
    }else{
      content.append(el('div','activities-line activities-idea-feature',
        '✨ '+(item.highlights?.length?item.highlights.slice(0,2).join(' · '):'Atividades não confirmadas')));
      content.append(el('div','activities-line','💡 '+(item.why||item.reason||'Confira as atrações')));
      if(item.animals?.length)content.append(el('div','activities-line','🐾 '+item.animals.join(', ')));
      content.append(el('div','activities-line','🕒 '+departurePt(item.bestTime)+' · '+weatherPt(item.weather)),
        el('div','activities-line','🏪 '+dayLabelPt(item.hoursDate)+': '+dayHoursPt(item.hoursToday)),
        el('div','activities-line activities-idea-price','💰 '+admissionPt(item.price)),
        el('div','activities-line','🚗 '+item.km+' km · '+item.driveMinutes+' min · 🎒 '+item.bring));
    }
    if(item.kind==='events'&&URLSAFE(item.sourceUrl)){
      const source=link('Source ↗',item.sourceUrl);source.className='activities-card-source';
      source.addEventListener('click',e=>e.stopPropagation(),{signal});content.append(source);
    }
    article.append(photo,content);return article;
  }
  let renderedPages=1;
  function updateScrollPage(){
    if(!grid.clientWidth)return;
    state.page=Math.max(0,Math.min(renderedPages-1,Math.round(grid.scrollLeft/grid.clientWidth)));
    pageLabel.textContent='Deslize ← → · '+(state.page+1)+' / '+renderedPages;
  }
  function render(){
    if(!active())return;
    controls();fit();track.replaceChildren();
    const arr=state.kind==='movies'?visibleMovies(state.items):state.items;
    const pageSizeNow=pageSize(),max=Math.max(1,Math.ceil(arr.length/pageSizeNow));
    const columns=((state.kind==='movies'||state.kind==='ideas'||state.kind==='home')&&window.innerWidth>=740&&
      (state.kind==='movies'||grid.getBoundingClientRect().height>=200))?2:1;
    state.page=Math.max(0,Math.min(max-1,state.page));
    renderedPages=max;
    if(state.busy||!arr.length){
      const panel=el('div','activities-grid');
      panel.style.gridTemplateColumns='minmax(0,1fr)';
      panel.style.gridTemplateRows='minmax(0,1fr)';
      track.append(panel);
      if(state.busy)message('Finding '+types[state.kind].toLowerCase()+'…','Checking up-to-date sources, available time and family preferences.');
      else message(state.error?'Recommendations unavailable':'No saved '+types[state.kind].toLowerCase(),
        'Press Refresh to find ideas for this mode. Nothing is generated automatically.');
    }else{
      for(let start=0;start<arr.length;start+=pageSizeNow){
        const pageItems=arr.slice(start,start+pageSizeNow);
        const panel=el('div','activities-grid');
        panel.style.gridTemplateColumns='repeat('+columns+',minmax(0,1fr))';
        // Fit exactly the visible rows in this page: no blank, compressed rows.
        const rows=state.kind==='movies'||state.kind==='ideas'||state.kind==='home'?
          Math.ceil(pageItems.length/columns):
          Math.max(pageItems.length,grid.getBoundingClientRect().height>=300?2:1);
        panel.style.gridTemplateRows='repeat('+Math.max(1,rows)+',minmax(0,1fr))';
        pageItems.forEach(item=>panel.append(card(item)));
        track.append(panel);
      }
    }
    grid.scrollLeft=state.page*grid.clientWidth;
    updateScrollPage();
    const last=state.snapshot?.generatedAt;
    const mismatch=state.kind==='ideas'&&state.snapshot?.options&&
      ['kids','budget','environment','maxKm'].some(k=>state.snapshot.options[k]!==state[k]);
    meta.textContent=(state.kind==='home'?'Escolha uma atividade e toque para ver o guia':
      last?'Saved '+stamp(last)+(mismatch?' · Filters changed; press Refresh':''):'Not generated')+
      (state.kind==='home'?' · '+arr.length+' ideias para '+(state.mode==='couple'?'um encontro romântico':state.mode==='visits'?'receber visitas':state.kids>0?'a família':'adultos'):'')+
      (state.kind==='movies'&&state.kids>0&&state.items.length>arr.length?' · '+(state.items.length-arr.length)+' filmes 14A/sem classificação ocultados':'')+
      (state.kind==='movies'&&arr.length?' · '+arr.length+' filmes confirmados'+
        (arr.some(x=>x.metadataVersion!==2)?' · Atualize para nota e sinopse em PT-BR':''):'')+
      (state.kind==='ideas'&&arr.length&&state.snapshot?.locale!=='pt-BR'?
        ' · Atualize para sugestões em português':'')+
      (state.error&&arr.length?' · '+state.error:'');
  }
  async function load(){
    if(!active())return;
    const selectedKind=state.kind,selectedMode=state.mode,selectedKids=state.kids;
    if(selectedKind==='home'){
      state.error='';state.snapshot={generatedAt:null};state.items=homeItems();state.page=0;render();
      // Optional 12th slot uses a SAVED, Canadian-available movie. Never
      // triggers TMDB search, never recommends adult/unknown-rated films to kids.
      try{
        const r=await fetch(urlFor('movies'),{cache:'no-store',credentials:'same-origin',signal});
        if(!r.ok)return;
        const d=await r.json();
        if(!active()||state.kind!=='home'||state.kids!==selectedKids||state.mode!==selectedMode)return;
        const candidate=homeMovie(d.items);
        if(candidate){
          const list=homeItems();const index=list.findIndex(x=>x.id==='home:movie');
          if(index>=0)list[index]=candidate;
          else list.splice(3,0,candidate);
          state.items=list.slice(0,12);render();
        }
      }catch{} // Curated home activities work offline.
      return;
    }
    state.error='';state.items=[];state.snapshot=null;state.page=0;render();
    try{
      const r=await fetch(urlFor(selectedKind),{cache:'no-store',credentials:'same-origin',signal});
      const d=await r.json();if(!r.ok)throw Error(d.error||'Unable to load saved ideas');
      if(!active()||state.kind!==selectedKind||state.mode!==selectedMode||
         (selectedKind==='movies'&&state.kids!==selectedKids))return;
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
    if(state.kind==='home'){state.homeRotation++;
      try{localStorage.setItem('family:activities:home:rotation',String(state.homeRotation));}catch{}
      load();return;}
    state.busy=true;state.error='';const kind=state.kind,mode=state.mode,kids=state.kids;render();
    try{
      const target=kind==='ideas'?'/api/activities/generate':'/api/activities/discover';
      const r=await fetch(target,{method:'POST',credentials:'same-origin',cache:'no-store',signal,
        headers:{'content-type':'application/json'},body:JSON.stringify({...params(),kind})});
      const d=await r.json();if(!r.ok)throw Error(d.error||'Generation failed');
      if(state.mode!==mode||state.kind!==kind||(kind==='movies'&&state.kids!==kids))return;
      state.snapshot=d;state.items=(d.items||[]).map(x=>({...x,kind}));
      state.page=0;
    }catch(e){state.error=e.message||'Generation failed. Old results are still stored.';}
    finally{state.busy=false;render();}
  }
  for(const btn of root.querySelectorAll('[data-mode-choice]'))btn.addEventListener('click',()=>{
    if(state.busy)return;
    state.mode=btn.dataset.modeChoice;Object.assign(state,defaults[state.mode]);
    if(state.mode==='couple')state.kids=0;persist();load();
  },{signal});
  for(const btn of root.querySelectorAll('[data-kind]'))btn.addEventListener('click',()=>{
    if(state.busy)return;
    state.kind=btn.dataset.kind;load();
  },{signal});
  for(const btn of root.querySelectorAll('[data-env]'))btn.addEventListener('click',()=>{
    state.environment=btn.dataset.env;persist();render();
  },{signal});
  for(const btn of root.querySelectorAll('[data-kids]'))btn.addEventListener('click',()=>{
    if(state.mode==='couple')return;
    state.kids=btn.dataset.kids==='yes'?2:0;persist();
    if(state.kind==='movies'||state.kind==='home')load();else render();
  },{signal});
  q('#ideas-budget').addEventListener('change',e=>{state.budget=e.target.value;persist();render();},{signal});
  q('#ideas-distance').addEventListener('change',e=>{
    state.maxKm=Number(e.target.value);persist();
    if(state.kind==='events')load(); else render();
  },{signal});
  refresh.addEventListener('click',generate,{signal});
  grid.addEventListener('scroll',updateScrollPage,{signal,passive:true});
  grid.addEventListener('keydown',e=>{
    if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;
    e.preventDefault();
    grid.scrollBy({left:(e.key==='ArrowRight'?1:-1)*grid.clientWidth,behavior:'smooth'});
  },{signal});
  window.addEventListener('resize',render,{signal});
  window.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();},{signal});
  cleanup=()=>{closeModal();ctrl.abort();};
  window.ActivitiesPanel.resume=()=>{fit();const clock=q('#ideas-clock');if(clock)clock.textContent=fmt();};
  render();loadFeedback();load();
 }
};
})();
