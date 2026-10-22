import {json,getJSON,local} from './shared.js';
import {normalizeOptions,validOrigin,safeSource} from './config.js';
import {originPoint} from './generate.js';

// Events and film releases are researched from open web references, never
// Google Places content. Each user-requested refresh incurs a web-search call.
const CACHE_PREFIX='family:activities:discovery:v1:';
const keyword=(kind,mode)=>CACHE_PREFIX+kind+':'+mode;
function parsedResponse(data){
  const text=(data.output||[]).flatMap(x=>(x.content||[]).filter(y=>y.type==='output_text').map(y=>y.text)).join('\n')
    ||data.output_text||'';
  const match=text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try{return JSON.parse(match);}catch{
    const a=match.indexOf('{'),b=match.lastIndexOf('}');
    if(a>=0&&b>a)return JSON.parse(match.slice(a,b+1));
  }
  return {};
}
function citedUrls(data){
  const links=new Set();
  for(const item of data.output||[]){
    for(const s of item.action?.sources||[]){const u=safeSource(s.url);if(u)links.add(u);}
    for(const content of item.content||[])for(const a of content.annotations||[]){
      const u=safeSource(a.url);if(u)links.add(u);
    }
  }
  return links;
}
async function research(env,kind,opts,day){
  const mode=opts.mode;
  const intro='You are researching for a private family activity dashboard for Ottawa, Ontario, Canada. '+
    'Search the LIVE web, not your memory. Date in Ottawa: '+day.date+'; local time: '+day.minute+
    ' minutes after midnight. Group '+opts.adults+' adults and '+opts.kids+' children. '+
    'Mode '+mode+' ('+(mode==='couple'?'adult-only romance/date':mode==='visits'?'visiting relatives and Ottawa sights':'family with children aged 8 and 5')+'). ';
  const instructions=kind==='events'?
    'Find genuine SPECIAL EVENTS happening TODAY at a specific venue in Ottawa, within approximately 20 km of the northwest Ottawa/Kanata area (distance will be checked independently). '+
    'Include festivals, free city events, community events, concerts, exhibits, popups, date nights, and kid-friendly events appropriate to the mode. '+
    'If it is late today, search tomorrow too, but indicate exact dates. '+
    'Check organizer pages such as ottawatourism.ca/en/event-calendar and ottawa.ca, and verify specific venue street addresses and start times. '+
    'NEVER invent event titles, exact addresses, tickets or dates. For each event return name, date (YYYY-MM-DD), startTime (HH:MM 24h or empty), venue, address (real street address or empty), sourceUrl and short reason. '+
    'Return JSON ONLY: {"items":[{"title":"","date":"","startTime":"","venue":"","address":"","sourceUrl":"","why":""}]}. Keep at most 8 results, exclude any that you cannot verify from a real URL.':
    'Find MOVIES with documented CANADIAN THEATRICAL release dates during '+day.date.slice(0,7)+' (the current month) in Canada. '+
    'Give up to 10 movies: title, Canada releaseDate YYYY-MM-DD, Ontario/Canadian rating if verifiable (G, PG, 14A, 18A, R) otherwise "Unverified", sourceUrl (the actual supporting page), why brief. '+
    (mode==='couple'?'Prioritize interesting date-night movies. ':
       'Only return movies with a verified G or PG family rating, suitable for children aged 5 and 8; omit unverified, 14A, 18A and R titles. ')+
    'Do NOT invent showtimes, availability or ticket prices. Return JSON ONLY: {"items":[{"title":"","releaseDate":"","rating":"","sourceUrl":"","why":""}]}. '+
    'Prefer official studio/distributor, film board or trusted movie release schedule pages.';
  const payload={model:'gpt-6-luna',reasoning:{effort:'low'},
    tools:[{type:'web_search',search_context_size:'medium',user_location:{type:'approximate',city:'Ottawa',region:'Ontario',country:'CA',timezone:'America/Toronto'}}],
    tool_choice:'required',include:['web_search_call.action.sources'],
    input:intro+instructions,store:false,max_output_tokens:2300};
  const data=await getJSON('https://api.openai.com/v1/responses',{
    method:'POST',timeoutMs:50000,
    headers:{'content-type':'application/json',authorization:'Bearer '+env.OPENAI_API_KEY},
    body:JSON.stringify(payload)});
  const parsed=parsedResponse(data);
  const cited=citedUrls(data);
  const rows=Array.isArray(parsed.items)?parsed.items:[];
  return rows.slice(0,12).map(item=>{
    const source=safeSource(item.sourceUrl);
    // Only show results with source URLs actually observed by the search tool.
    if(!source||!cited.has(source))return null;
    const title=String(item.title||'').slice(0,110).trim();
    if(!title)return null;
    if(kind==='movies'){
      const releaseDate=String(item.releaseDate||'');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)||!releaseDate.startsWith(day.date.slice(0,7)))return null;
      const rating=String(item.rating||'Unverified').toUpperCase();
      if(mode!=='couple'&&!['G','PG'].includes(rating))return null;
      return {id:'movie:'+title.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,70),kind,
        name:title,releaseDate,rating,sourceUrl:source,reason:String(item.why||'').slice(0,170)};
    }
    const date=String(item.date||''),startTime=String(item.startTime||'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
    if(date!==day.date)return null;
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime))return null;
    if((Number(startTime.slice(0,2))*60+Number(startTime.slice(3)))<day.minute+15)return null;
    const address=String(item.address||'').slice(0,180).trim();
    if(!address || address.length<12)return null;
    return {id:'event:'+title.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,70),
      kind,name:title,date,time:startTime,venue:String(item.venue||'').slice(0,100),
      address,sourceUrl:source,reason:String(item.why||'').slice(0,170)};
  }).filter(Boolean);
}
async function verifyEventDistances(env,items){
  if(!items.length)return [];
  const home=await originPoint(env);
  const geo=await Promise.all(items.slice(0,8).map(async e=>{
    try{
      const u=new URL('https://maps.googleapis.com/maps/api/geocode/json');
      u.searchParams.set('address',e.address);u.searchParams.set('key',env.GOOGLE_MAPS_API_KEY);
      const r=await getJSON(u.toString());
      const p=r.results?.[0];
      if(r.status!=='OK'||!p?.geometry?.location||p.partial_match)return null;
      if((p.types||[]).some(t=>['locality','administrative_area_level_1','country'].includes(t)))return null;
      return {event:e,coords:p.geometry.location};
    }catch{return null;}
  }));
  const verified=geo.filter(Boolean);
  if(!verified.length)return [];
  const body={origins:[{waypoint:{location:{latLng:{latitude:home.lat,longitude:home.lng}}}}],
    destinations:verified.map(p=>({waypoint:{location:{latLng:{latitude:p.coords.lat,longitude:p.coords.lng}}}})),
    travelMode:'DRIVE',routingPreference:'TRAFFIC_UNAWARE'};
  const matrix=await getJSON('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix',{
    method:'POST',headers:{'X-Goog-Api-Key':env.GOOGLE_MAPS_API_KEY,'content-type':'application/json',
      'X-Goog-FieldMask':'originIndex,destinationIndex,condition,distanceMeters,duration'},
    body:JSON.stringify(body)});
  if(!Array.isArray(matrix))return [];
  return matrix.filter(r=>r.condition==='ROUTE_EXISTS'&&Number(r.distanceMeters)<=20000)
    .map(r=>{
      const p=verified[r.destinationIndex];if(!p)return null;
      return {...p.event,km:Math.round(r.distanceMeters/100)/10,driveMinutes:Math.ceil(parseFloat(r.duration)/60)};
    }).filter(Boolean).slice(0,6);
}
export async function onRequestGet({request,env}){
  if(!env.ACTIVITIES_KV)return json({items:[],generatedAt:null});
  const u=new URL(request.url),kind=u.searchParams.get('kind')==='movies'?'movies':'events';
  const mode=normalizeOptions({mode:u.searchParams.get('mode')}).mode;
  try{
    const saved=await env.ACTIVITIES_KV.get(keyword(kind,mode),'json');
    if(!saved)return json({items:[],kind,mode,generatedAt:null});
    const now=local();
    const items=(saved.items||[]).filter(x=>kind==='movies'?x.releaseDate?.startsWith(now.date.slice(0,7)):
      x.date===now.date&&x.time&&(Number(x.time.slice(0,2))*60+Number(x.time.slice(3)))>=now.minute);
    return json({...saved,items});
  }catch{return json({error:'Saved discovery could not be loaded'},502);}
}
export async function onRequestPost({request,env}){
  if(!validOrigin(request))return json({error:'Same-origin dashboard request required'},403);
  if(!env.OPENAI_API_KEY||!env.ACTIVITIES_KV)return json({error:'OpenAI and KV configuration required'},503);
  try{
    const input=await request.json(),kind=input.kind==='movies'?'movies':'events';
    const opts=normalizeOptions(input),now=local();
    const key=keyword(kind,opts.mode),limit=key+':last-request';
    const last=Number(await env.ACTIVITIES_KV.get(limit)||0);
    if(Date.now()-last<90000)return json({error:'Please wait before another discovery refresh'},429);
    await env.ACTIVITIES_KV.put(limit,String(Date.now()),{expirationTtl:120});
    let items=await research(env,kind,opts,now);
    if(kind==='events'){
      if(!env.GOOGLE_MAPS_API_KEY||!env.HOME_ADDRESS)throw Error('Maps integration required for event distance verification');
      items=await verifyEventDistances(env,items);
    }
    const saved={kind,mode:opts.mode,generatedAt:new Date().toISOString(),
      month:now.date.slice(0,7),date:now.date,items,disclaimer:kind==='movies'?
        'Canada release dates, not confirmed local showtimes. Check cinemas before booking.':
        'Organizer times may change. Distance checked by road; verify the official event page.'};
    await env.ACTIVITIES_KV.put(key,JSON.stringify(saved),{expirationTtl:kind==='movies'?35*86400:2*86400});
    return json(saved);
  }catch(e){return json({error:String(e?.message||'Research failed').slice(0,160)},502);}
}
