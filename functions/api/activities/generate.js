import {ZONE,CACHE_KEY,MAX_KM,json,local,addDay,ranges,openDuring,outdoorWeather,hourText,getJSON} from './shared.js';
import {onRequestGet as calendarGet} from '../calendar.js';

// Explicit user action only: no scheduled generation, no AI on page load.
const queries=[
  ['park','parks playgrounds walking trails family Ottawa Ontario'],
  ['indoor','indoor playground trampoline bowling kids Ottawa Ontario'],
  ['museum','museums science family kids Ottawa Ontario'],
  ['recreation','indoor swimming pools recreation centres Ottawa Ontario'],
  ['library','public libraries children Ottawa Ontario'],
  ['animals','family animal farm nature centre Ottawa Ontario']
];
const fieldMask=['places.id','places.displayName','places.formattedAddress','places.location','places.googleMapsUri',
  'places.businessStatus','places.currentOpeningHours','places.rating','places.userRatingCount',
  'places.primaryType','places.websiteUri','places.attributions'].join(',');
function authOrigin(request) {
  const origin=request.headers.get('origin');
  const site=request.headers.get('sec-fetch-site');
  return origin===new URL(request.url).origin && (!site||site==='same-origin');
}
export async function originPoint(env) {
  // Provider status only: never log the full request URL, exact home address,
  // key, or provider error_message (which can include sensitive input).
  const address=String(env.HOME_ADDRESS||'').trim();
  if(!address)throw Error('HOME_ADDRESS secret is empty in this Cloudflare environment');
  const u=new URL('https://maps.googleapis.com/maps/api/geocode/json');
  u.searchParams.set('address',address);
  u.searchParams.set('key',env.GOOGLE_MAPS_API_KEY);
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),14000);
  let resp,data;
  try {
    resp=await fetch(u.toString(),{signal:ctrl.signal});
    data=await resp.json();
  } catch {
    throw Error('Google Geocoding network request failed or timed out');
  } finally {clearTimeout(timer);}
  const code=String(data?.status||'').toUpperCase();
  if(code==='OK'&&data.results?.[0]?.geometry?.location)
    return data.results[0].geometry.location;
  const messages={
    ZERO_RESULTS:'Google Geocoding ZERO_RESULTS: verify HOME_ADDRESS spelling, house number and Ottawa, ON, Canada',
    REQUEST_DENIED:'Google Geocoding REQUEST_DENIED: check Geocoding API enabled and Google key restrictions',
    OVER_DAILY_LIMIT:'Google Geocoding OVER_DAILY_LIMIT: verify billing, key validity and quota',
    OVER_QUERY_LIMIT:'Google Geocoding OVER_QUERY_LIMIT: requests quota reached',
    INVALID_REQUEST:'Google Geocoding INVALID_REQUEST: verify the HOME_ADDRESS secret',
    UNKNOWN_ERROR:'Google Geocoding UNKNOWN_ERROR: Google could not process the request'
  };
  throw Error(messages[code]||('Google Geocoding failed: '+(code||'HTTP '+resp.status)));
}
export async function forecast(origin) {
  const u=new URL('https://api.open-meteo.com/v1/forecast');
  Object.entries({latitude:String(origin.lat),longitude:String(origin.lng),
    hourly:'temperature_2m,precipitation_probability,wind_speed_10m',timezone:ZONE,forecast_days:'2'})
    .forEach(([k,v])=>u.searchParams.set(k,v));
  const r=await getJSON(u.toString()),h=r.hourly;
  if(!Array.isArray(h?.time))throw Error('Weather forecast missing');
  return h.time.map((time,i)=>({time,temp:h.temperature_2m[i],rain:h.precipitation_probability[i],wind:h.wind_speed_10m[i]}));
}
async function findPlaces(key,origin) {
  const results=await Promise.allSettled(queries.map(async ([category,query])=>{
    const r=await getJSON('https://places.googleapis.com/v1/places:searchText',{
      method:'POST',
      headers:{'content-type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':fieldMask},
      body:JSON.stringify({textQuery:query,languageCode:'en',pageSize:12,
        locationBias:{circle:{center:{latitude:origin.lat,longitude:origin.lng},radius:20000}}})
    });
    return (r.places||[]).filter(p=>p.id&&p.location&&p.businessStatus!=='CLOSED_PERMANENTLY')
      .map(p=>({...p,category}));
  }));
  const dedup=new Map();
  for(const result of results)if(result.status==='fulfilled')for(const p of result.value)
    if(!dedup.has(p.id))dedup.set(p.id,p);
  if(dedup.size<4)throw Error('Not enough verified places from Google Places');
  return [...dedup.values()].slice(0,45);
}
export async function routes(key,origin,places) {
  const data=await getJSON('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix',{
    method:'POST',
    headers:{'content-type':'application/json','X-Goog-Api-Key':key,
      'X-Goog-FieldMask':'originIndex,destinationIndex,condition,distanceMeters,duration'},
    body:JSON.stringify({origins:[{waypoint:{location:{latLng:{latitude:origin.lat,longitude:origin.lng}}}}],
      destinations:places.map(p=>({waypoint:{placeId:p.id}})),
      travelMode:'DRIVE',routingPreference:'TRAFFIC_UNAWARE'})
  });
  if(!Array.isArray(data))throw Error('Google Routes returned an unexpected matrix');
  const map=new Map();
  for(const r of data)if(r.condition==='ROUTE_EXISTS'&&Number.isFinite(r.distanceMeters)&&r.destinationIndex>=0) {
    map.set(r.destinationIndex,{km:r.distanceMeters/1000,minutes:Math.ceil(parseFloat(r.duration)/60)});
  }
  return map;
}
export function openingLabel(place) {
  const hours=place.currentOpeningHours;
  if(!Array.isArray(hours?.weekdayDescriptions))return 'Hours unverified';
  return hours.weekdayDescriptions.join(' · ').slice(0,400);
}
export function scheduleFor(place,drive,date,earliest,busy,hours) {
  const duration=place.category==='museum'?95:75;
  let best=null;
  for(let t=earliest;t+2*drive+duration<=20*60;t+=30) {
    const arrival=t+drive,done=arrival+duration,home=done+drive;
    if(busy.some(([a,b])=>a<home&&b>t))continue;
    const open=openDuring(place.currentOpeningHours,date,arrival,done);
    if(open===false)continue;
    const outdoor=['park','animals'].includes(place.category);
    const w=outdoorWeather(hours,date,arrival);
    // Bad weather discourages outdoor activities but does not silently replace them.
    const penalty=(outdoor?w.penalty:0)+(open===null?3:0)+(t-earliest)/140;
    if(!best||penalty<best.penalty)best={t,penalty,weather:w.description,hoursVerified:open===true};
  }
  return best;
}
function parseChoice(data) {
  const pieces=(data.output||[]).flatMap(x=>(x.content||[]).filter(y=>y.type==='output_text').map(y=>y.text));
  const raw=(data.output_text||pieces.join('\n')).trim().replace(/^\x60\x60\x60(?:json)?\s*/i,'').replace(/\s*\x60\x60\x60$/,'');
  let obj;try{obj=JSON.parse(raw);}catch{const b=raw.indexOf('{'),e=raw.lastIndexOf('}');if(b>=0&&e>b)obj=JSON.parse(raw.slice(b,e+1));}
  if(!obj||!Array.isArray(obj.categories))throw Error('AI returned invalid activity types');
  return obj;
}
async function selectWithAI(env,date,forecastSummary,earliest,blocked) {
  // Do not send Google Places or Routes content to an LLM. It only plans
  // activity TYPES and packing advice from first-party family/schedule data.
  const categories=queries.map(x=>x[0]);
  const instruction='Plan family activity TYPES for two adults and children aged 8 and 5 in Ottawa, Canada. '+
    'Prioritize a varied day with both indoor and outdoor ideas as weather permits. '+
    'Choose six category names, ordered from best to least fitting, only from '+JSON.stringify(categories)+'. '+
    'Do not invent any particular venue, price, opening hours, address, distance or rating. '+
    'Return JSON ONLY: {"categories":["park","museum",...],"notes":{"park":{"bring":"short packing list","why":"brief fun activity description"},...}}. '+
    'Each category note should be practical, age appropriate, and not name any specific business.';
  const input=instruction+'\nDate: '+date+'; first available departure minute after midnight: '+earliest+
    '; busy time ranges (minutes): '+JSON.stringify(blocked)+'\nWeather: '+forecastSummary;
  if(!env.OPENAI_API_KEY)throw Error('Add OPENAI_API_KEY as a Cloudflare secret');
  const data=await getJSON('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{authorization:'Bearer '+env.OPENAI_API_KEY,'content-type':'application/json'},
    body:JSON.stringify({
      model:'gpt-6-luna',
      reasoning:{effort:'none'},
      input,store:false,max_output_tokens:1800
    })
  });
  const parsed=parseChoice(data);
  const ordered=[...new Set(parsed.categories.filter(x=>categories.includes(x)))];
  if(ordered.length<3)throw Error('OpenAI did not return enough distinct activity types');
  return {categories:ordered,notes:parsed.notes||{},provider:'GPT-6 Luna'};
}
export async function onRequestPost(context) {
  const {request,env}=context;
  if(!authOrigin(request))return json({error:'Use the What to Do button on the protected dashboard.'},403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'JSON required'},415);
  if(!env.ACTIVITIES_KV||!env.GOOGLE_MAPS_API_KEY||!env.HOME_ADDRESS)
    return json({error:'Activities setup incomplete: KV, Google Maps key, or private home address is missing.'},503);
  if(!env.OPENAI_API_KEY)
    return json({error:'Add OPENAI_API_KEY to Cloudflare secrets.'},503);
  try{
    const last=Number(await env.ACTIVITIES_KV.get(CACHE_KEY+':last-request')||0);
    if(Date.now()-last<90000)return json({error:'Refresh was used recently. Try again in a minute.'},429);
    await env.ACTIVITIES_KV.put(CACHE_KEY+':last-request',String(Date.now()),{expirationTtl:120});
    const now=local();
    let targetDate=now.minute>=1200?addDay(now.date):now.date;
    const earliestFor=date=>{
      const day=local(new Date(date+'T12:00:00Z')).weekday;
      const minimum=['Sat','Sun'].includes(day)?540:930;
      return date===now.date?Math.max(now.minute+15,minimum):minimum;
    };
    const agendaFor=async date=>{
      const u=new URL(request.url);u.pathname='/api/calendar';u.searchParams.set('date',date);
      const r=await calendarGet({...context,request:new Request(u.toString(),{method:'GET'})});
      if(!r.ok)throw Error('Google Calendar is unavailable; cannot safely avoid appointments');
      const data=await r.json();
      if(data.partial)throw Error('One or more calendars could not be checked');
      return ranges(data.events,date);
    };
    const [home,firstBusy]=await Promise.all([originPoint(env),agendaFor(targetDate)]);
    if(firstBusy.some(([a,b])=>a===0&&b===1440))
      return json({error:'Calendar has an all-day commitment on the selected day.'},409);
    const [weather,places]=await Promise.all([forecast(home),findPlaces(env.GOOGLE_MAPS_API_KEY,home)]);
    const distances=await routes(env.GOOGLE_MAPS_API_KEY,home,places);
    const makePool=(date,earliest,blocked)=>places.map((p,i)=>{
      const route=distances.get(i);
      if(!route||route.km>MAX_KM||!Number.isFinite(route.minutes))return null;
      const schedule=scheduleFor(p,route.minutes,date,earliest,blocked,weather);
      if(!schedule)return null;
      return {id:p.id,name:p.displayName?.text||'Activity',category:p.category,
        address:p.formattedAddress||'',km:Math.round(route.km*10)/10,driveMinutes:route.minutes,
        rating:Number(p.rating)||null,reviewCount:Number(p.userRatingCount)||0,
        website:p.websiteUri||'',mapsUrl:p.googleMapsUri||'',
        openingHours:openingLabel(p),hoursVerified:schedule.hoursVerified,
        bestTime:'Leave at '+hourText(schedule.t),weather:schedule.weather,
        penalty:schedule.penalty,attributions:(p.attributions||[]).map(x=>({provider:x.provider||'',uri:x.providerUri||''})),
        score:(Number(p.rating)||3.5)*3 + Math.log10(1+(p.userRatingCount||0)) - route.km*0.23 -schedule.penalty};
    }).filter(Boolean).sort((a,b)=>b.score-a.score).slice(0,26);
    let pool=makePool(targetDate,earliestFor(targetDate),firstBusy);
    if(pool.length<4 && targetDate===now.date) {
      // If it is too late for a realistic outing, use tomorrow's free hours
      // without charging again for Places/Routes searches.
      const tomorrow=addDay(targetDate),tomorrowBusy=await agendaFor(tomorrow);
      if(!tomorrowBusy.some(([a,b])=>a===0&&b===1440)){
        const nextPool=makePool(tomorrow,earliestFor(tomorrow),tomorrowBusy);
        if(nextPool.length>pool.length){targetDate=tomorrow;pool=nextPool;}
      }
    }
    if(pool.length<4)throw Error('Fewer than four suitable places with verified driving distances and free time slots');
    const choice=await selectWithAI(env,targetDate,weather.filter(x=>x.time.startsWith(targetDate) && Number(x.time.slice(11,13))*60>=earliestFor(targetDate)-30).slice(0,12)
      .map(x=>x.time.slice(11,16)+' '+Math.round(x.temp)+'°C/'+x.rain+'% rain').join('; '),earliestFor(targetDate),targetDate===now.date?firstBusy:[]);
    const byId=new Map(pool.map(x=>[x.id,x]));
    const preferences=[...new Set([...choice.categories,...queries.map(q=>q[0])])];
    const ranked=preferences.flatMap(cat=>pool.filter(p=>p.category===cat).map(p=>p.id));
    const ids=[],categoryCount=new Map();
    // Enforce variety even when the model over-selects one category.
    for(const cap of [2,3,8]) {
      for(const id of ranked) {
        if(ids.length>=8)break;
        if(ids.includes(id))continue;
        const cat=byId.get(id)?.category;if(!cat)continue;
        const count=categoryCount.get(cat)||0;
        if(count>=cap)continue;
        ids.push(id);categoryCount.set(cat,count+1);
      }
    }
    const items=ids.map(id=>{
      const p=byId.get(id);if(!p)return null;
      const note=choice.notes[p.category]||{};
      const {score,penalty,...publicPlace}=p;
      return {...publicPlace,bring:typeof note.bring==='string'?note.bring.slice(0,100):'Water and weather-appropriate layers',
        reason:typeof note.why==='string'?note.why.slice(0,140):'Family-friendly place nearby',
        price:'Check admission price'};
    }).filter(Boolean);
    const result={date:targetDate,generatedAt:new Date().toISOString(),provider:choice.provider,
      items,coverage:items.length,timezone:ZONE};
    // Cache only place IDs, user-facing activity types and model-authored notes.
    // Never persist Google place names/addresses/ratings/hours/route data.
    const stored={date:targetDate,generatedAt:result.generatedAt,provider:choice.provider,
      items:items.map(({id,category,bring,reason})=>({id,category,bring,reason})),
      timezone:ZONE};
    await env.ACTIVITIES_KV.put(CACHE_KEY,JSON.stringify(stored),{expirationTtl:28*24*60*60});
    return json(result);
  }catch(e){return json({error:String(e?.message||'Generation failed').slice(0,220)},502);}
}
