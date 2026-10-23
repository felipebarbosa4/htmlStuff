import {tooSoon,refreshAfter,ZONE,CACHE_KEY,MAX_KM,json,local,addDay,ranges,openDuring,outdoorWeather,hourText,getJSON} from './shared.js';
import {onRequestGet as calendarGet} from '../calendar.js';
import {hoursForDate} from './hours.js';
import {venueFacts,factsDisplay} from './enrich.js';
import {CATEGORY_SETS,OUTDOOR,FREE_CANDIDATES,FEEDBACK_KEY,normalizeOptions,keyFor,preferencesFrom,learnedCounts,validOrigin} from './config.js';

// Explicit user action only: no scheduled generation, no AI on page load.
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
export function isNight(minutes) {return minutes>=20*60 || minutes<5*60;}
export function eligibleNightCategory(category) {return ['indoor','food','culture','recreation'].includes(category);}
async function findPlaces(key,origin,options,night=false) {
  const all=CATEGORY_SETS[options.mode];
  const adultsOnly=options.mode==='family'&&options.kids===0;
  const adultQueries={park:'scenic parks walks gardens Ottawa Ontario',indoor:'indoor entertainment bowling escape room Ottawa Ontario',
    museum:'art history science exhibitions Ottawa Ontario',recreation:'recreation wellness swimming Ottawa Ontario',
    library:'Ottawa library exhibitions cultural events',animals:'nature walking trails wildlife sanctuary Ottawa Ontario',
    food:'best cafes dessert restaurant Ottawa Ontario',cinema:'cinema movies Ottawa Ontario'};
  const queries=all.filter(([cat])=>options.environment==='all'||(OUTDOOR.has(cat)?'outdoor':'indoor')===options.environment)
    .filter(([cat])=>options.budget!=='free'||FREE_CANDIDATES.has(cat))
    .filter(([cat])=>!night||eligibleNightCategory(cat));
  const results=await Promise.allSettled(queries.map(async ([category,query])=>{
    const nightQuery=night?{
      food:'late night family friendly restaurant dessert cafe open late Ottawa Barrhaven Nepean',
      indoor:'late night bowling arcade indoor games open late Ottawa Ontario',
      culture:'late night live entertainment music shows open late Ottawa Ontario',
      recreation:'late night indoor recreation bowling billiards Ottawa Ontario'
    }[category]:null;
    const r=await getJSON('https://places.googleapis.com/v1/places:searchText',{
      method:'POST',
      headers:{'content-type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':fieldMask},
      body:JSON.stringify({textQuery:nightQuery||(adultsOnly?adultQueries[category]:query),languageCode:'en',pageSize:12,
        locationBias:{circle:{center:{latitude:origin.lat,longitude:origin.lng},radius:options.maxKm*1000}}})
    });
    return (r.places||[]).filter(p=>p.id&&p.location&&p.businessStatus!=='CLOSED_PERMANENTLY')
      .map(p=>({...p,category}));
  }));
  const dedup=new Map();
  for(const result of results)if(result.status==='fulfilled')for(const p of result.value)
    if(!dedup.has(p.id))dedup.set(p.id,p);
  if(!dedup.size)throw Error('No matching verified places from Google Places');
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
export function scheduleFor(place,drive,date,earliest,busy,hours,latest=1200,night=false) {
  const duration=night?45:(place.category==='museum'?95:75);
  let best=null;
  for(let t=earliest;t+2*drive+duration<=latest;t+=30) {
    const arrival=t+drive,done=arrival+duration,home=done+drive;
    if(busy.some(([a,b])=>a<home&&b>t))continue;
    const open=openDuring(place.currentOpeningHours,date,arrival,done);
    if(night?open!==true:open===false)continue;
    const outdoor=OUTDOOR.has(place.category);
    if(night&&(!eligibleNightCategory(place.category)||outdoor))continue;
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
async function selectWithAI(env,date,forecastSummary,earliest,blocked,options,counts) {
  // The AI sees only first-party family preferences, time availability, and weather.
  // Google Places, Routes and exact home coordinates never enter the LLM input.
  const categories=CATEGORY_SETS[options.mode].map(x=>x[0])
    .filter(cat=>options.environment==='all'||(OUTDOOR.has(cat)?'outdoor':'indoor')===options.environment)
    .filter(cat=>options.budget!=='free'||FREE_CANDIDATES.has(cat))
    .filter(cat=>!options.nightMode||eligibleNightCategory(cat));
  const scenario=options.mode==='couple'?'romantic couple date, adult conversation and fun':
    options.mode==='visits'?'show first-time visitors the memorable character of Ottawa, kid-friendly where needed':
    options.kids>0?'playful and educational family outing':'adult-friendly local outings without children';
  const instruction='You are an expert local outing planner for Ottawa, Ontario, Canada. '+
    'Choose an ORDERED list of up to six suitable categories ONLY from '+JSON.stringify(categories)+'. '+
    'Situation: '+scenario+'. Group: '+options.adults+' adults, '+options.kids+' children'+
    (options.kids? ' (including ages 8 and 5 when the children are Luna and Apollo).':' (adult-only outing).')+
    ' Prioritize the CURRENT TIME, weather, available free slots and age appropriateness. '+
    'Budget preference: '+options.budget+' (free / under CAD 100 / no limit). Never promise an unverified price. '+
    'Environment: '+options.environment+'. Learned category feedback counts are supplied; prefer likes and avoid dislikes. '+
    (options.nightMode?'It is night RIGHT NOW. Return only late-night indoor entertainment/cafes/dining types with verified-open venues; no parks or next-day advice. ':'')+
    'Never create names of venues, movie screenings, events, addresses, distances, ratings or opening hours. '+
    'Return valid JSON ONLY: {"categories":["park","museum"],"notes":{"park":{"bring":"short practical packing list","why":"short age-relevant reason"}}}. '+
    'Provide a distinct, brief practical packing list and reason for every selected category. '+
    'IMPORTANT: Write the notes.bring and notes.why text entirely in natural Brazilian Portuguese (pt-BR). '+
    'Keep category identifiers in English exactly as provided; do not translate JSON keys. '+
    'Use natural expressions suitable for a family in Ottawa; be concise and do not invent venue-specific facts.';
  const input=instruction+'\nToday: '+date+' in America/Toronto; earliest departure '+earliest+
    ' minutes after midnight; blocked intervals '+JSON.stringify(blocked)+
    '\nForecast after the earliest departure: '+forecastSummary+
    '\nCategory preferences (non-identifying counts): '+JSON.stringify(counts);
  const data=await getJSON('https://api.openai.com/v1/responses',{
    method:'POST',headers:{authorization:'Bearer '+env.OPENAI_API_KEY,'content-type':'application/json'},
    body:JSON.stringify({model:'gpt-6-luna',reasoning:{effort:'none'},input,store:false,max_output_tokens:1600})
  });
  const parsed=parseChoice(data);
  const ordered=[...new Set(parsed.categories.filter(x=>categories.includes(x)))];
  if(!ordered.length)throw Error('OpenAI did not return valid activity types');
  return {categories:ordered,notes:parsed.notes||{},provider:'GPT-6 Luna'};
}
export async function onRequestPost(context) {
  const {request,env}=context;
  if(!validOrigin(request))return json({error:'Use the What to Do button on the protected dashboard.'},403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'JSON required'},415);
  if(!env.ACTIVITIES_KV||!env.GOOGLE_MAPS_API_KEY||!env.HOME_ADDRESS)
    return json({error:'Activities setup incomplete: KV, Google Maps key, or private home address is missing.'},503);
  if(!env.OPENAI_API_KEY)
    return json({error:'Add OPENAI_API_KEY to Cloudflare secrets.'},503);
  try{
    const input=await request.json();
    const options=normalizeOptions(input);
    const history=preferencesFrom(await env.ACTIVITIES_KV.get(FEEDBACK_KEY,'json'));
    const counts=learnedCounts(history,options.mode);
    const last=Number(await env.ACTIVITIES_KV.get(CACHE_KEY+':last-request')||0);
    const requestAt=Date.now();
    if(last>0&&requestAt-last<90000)return tooSoon(last,90000,requestAt);
    await env.ACTIVITIES_KV.put(CACHE_KEY+':last-request',String(requestAt),{expirationTtl:120});
    const now=local();
    const night=isNight(now.minute);
    const latest=night?1440:options.mode==='couple'?1410:options.mode==='visits'?1290:1200;
    const cutoff=options.mode==='couple'?1320:options.mode==='visits'?1260:1200;
    let targetDate=night?now.date:now.minute>=cutoff?addDay(now.date):now.date;
    options.nightMode=night;
    const earliestFor=date=>{
      const day=local(new Date(date+'T12:00:00Z')).weekday;
      // Children cannot leave until school finishes on weekdays; when Kids=No,
      // use the current clock instead of imposing the school schedule.
      const minimum=night?0:options.kids>0&&!['Sat','Sun'].includes(day)?930:0;
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
    if(night && options.environment==='outdoor')
      return json({error:'After 8 PM, outdoor-only suggestions are disabled for safety. Select Indoor or Both.'},422);
    if(night && options.budget==='free')
      return json({error:'No verified free nighttime venues in this category set. Select another budget.'},422);
    const [home,firstBusy]=await Promise.all([originPoint(env),agendaFor(targetDate)]);
    const [weather,places]=await Promise.all([forecast(home),findPlaces(env.GOOGLE_MAPS_API_KEY,home,options,night)]);
    const distances=await routes(env.GOOGLE_MAPS_API_KEY,home,places);
    const makePool=(date,earliest,blocked)=>places.map((p,i)=>{
      const route=distances.get(i);
      if(!route||route.km>options.maxKm||!Number.isFinite(route.minutes))return null;
      const schedule=scheduleFor(p,route.minutes,date,earliest,blocked,weather,latest,night);
      if(!schedule)return null;
      return {id:p.id,name:p.displayName?.text||'Activity',category:p.category,
        address:p.formattedAddress||'',km:Math.round(route.km*10)/10,driveMinutes:route.minutes,
        rating:Number(p.rating)||null,reviewCount:Number(p.userRatingCount)||0,
        website:p.websiteUri||'',mapsUrl:p.googleMapsUri||'',
        openingHours:openingLabel(p),hoursToday:hoursForDate(p.currentOpeningHours,date).label,
        hoursDate:date,hoursVerified:schedule.hoursVerified,
        bestTime:'Leave at '+hourText(schedule.t),departureMinute:schedule.t,weather:schedule.weather,
        penalty:schedule.penalty,attributions:(p.attributions||[]).map(x=>({provider:x.provider||'',uri:x.providerUri||''})),
        score:(Number(p.rating)||3.5)*3 + Math.log10(1+(p.userRatingCount||0)) - route.km*0.23 -schedule.penalty};
    }).filter(Boolean).sort((a,b)=>b.score-a.score).slice(0,26);
    let pool=makePool(targetDate,earliestFor(targetDate),firstBusy);
    if(!night && pool.length===0 && targetDate===now.date) {
      // If it is too late for a realistic outing, use tomorrow's free hours
      // without charging again for Places/Routes searches.
      const tomorrow=addDay(targetDate),tomorrowBusy=await agendaFor(tomorrow);
      const nextPool=makePool(tomorrow,earliestFor(tomorrow),tomorrowBusy);
      if(nextPool.length>pool.length){targetDate=tomorrow;pool=nextPool;}
    }
    if(!pool.length)throw Error(night?'No indoor activities confirmed open for enough time tonight within '+options.maxKm+' km. Try another distance or tomorrow.':'No suitable places with verified driving distances and available slots');
    const choice=await selectWithAI(env,targetDate,weather.filter(x=>x.time.startsWith(targetDate) && Number(x.time.slice(11,13))*60>=earliestFor(targetDate)-30).slice(0,12)
      .map(x=>x.time.slice(11,16)+' '+Math.round(x.temp)+'°C/'+x.rain+'% rain').join('; '),earliestFor(targetDate),targetDate===now.date?firstBusy:[],options,counts);
    // Feedback is authoritative: exclude places marked Not interested; de-prioritize
    // visited ones. Likes receive priority without sharing place IDs with OpenAI.
    const feedbackById=new Map(history.filter(x=>x.mode===options.mode).map(x=>[x.id,x.value]));
    pool=pool.filter(p=>feedbackById.get(p.id)!=='dislike');
    pool.sort((a,b)=>{
      const bonus=x=>feedbackById.get(x.id)==='like'?5:feedbackById.get(x.id)==='visited'?-7:0;
      return (b.score+bonus(b))-(a.score+bonus(a));
    });
    const byId=new Map(pool.map(x=>[x.id,x]));
    const preferences=[...new Set([...choice.categories,...CATEGORY_SETS[options.mode].map(q=>q[0])])].filter(cat=>!night||eligibleNightCategory(cat));
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
    const facts=await venueFacts(env,ids.map(id=>byId.get(id)),{research:true});
    const items=ids.map(id=>{
      const p=byId.get(id);if(!p)return null;
      const note=choice.notes[p.category]||{};
      const {score,penalty,...publicPlace}=p;
      return {...publicPlace,...factsDisplay(facts.get(id),options.adults,options.kids),bring:typeof note.bring==='string'?note.bring.slice(0,100):'Água e roupas adequadas ao clima',
        reason:typeof note.why==='string'?note.why.slice(0,140):'Passeio para aproveitar em família'};
    }).filter(Boolean);
    const result={date:targetDate,generatedAt:new Date().toISOString(),provider:choice.provider,
      items,coverage:items.length,timezone:ZONE,locale:'pt-BR',options:{...options,nightMode:night}};
    // Cache only place IDs, user-facing activity types and model-authored notes.
    // Never persist Google place names/addresses/ratings/hours/route data.
    const stored={date:targetDate,generatedAt:result.generatedAt,provider:choice.provider,
      items:items.map(({id,category,bring,reason})=>({id,category,bring,reason})),
      timezone:ZONE,locale:'pt-BR',options};
    await env.ACTIVITIES_KV.put(keyFor(options.mode),JSON.stringify(stored),{expirationTtl:28*24*60*60});
    return json({...result,...refreshAfter(requestAt)});
  }catch(e){return json({error:String(e?.message||'Generation failed').slice(0,220)},502);}
}
