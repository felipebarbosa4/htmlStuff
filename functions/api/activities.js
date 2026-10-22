import {CACHE_KEY,MAX_KM,json,local,addDay,ranges,hourText,getJSON} from './activities/shared.js';
import {originPoint,forecast,routes,openingLabel,scheduleFor} from './activities/generate.js';
import {onRequestGet as calendarGet} from './calendar.js';
import {keyFor,normalizeOptions} from './activities/config.js';
import {hoursForDate} from './activities/hours.js';
import {venueFacts,factsDisplay} from './activities/enrich.js';

const placeMask='id,displayName,formattedAddress,businessStatus,currentOpeningHours,googleMapsUri,websiteUri,attributions';
const MAPS='https://places.googleapis.com/v1/places/';

// Read only persisted place IDs + the model's original notes, then resolve
// current Google Maps content live. Never save Google Content in Cloudflare KV.
export async function onRequestGet(context) {
  const {env,request}=context;
  if(!env.ACTIVITIES_KV)return json({error:'Activities storage is not configured.'},503);
  try {
    const mode=normalizeOptions({mode:new URL(request.url).searchParams.get('mode')}).mode;
    const saved=await env.ACTIVITIES_KV.get(keyFor(mode),'json');
    if(!saved||!Array.isArray(saved.items)||!saved.items.length)
      return json({items:[],generatedAt:null,provider:null,date:null});
    if(!env.GOOGLE_MAPS_API_KEY||!env.HOME_ADDRESS)
      return json({error:'The Places integration needs configuration to show saved activities.'},503);
    const known=saved.items.filter(x=>typeof x.id==='string'&&x.id.length<200).slice(0,8);
    const [home,details]=await Promise.all([
      originPoint(env),
      Promise.all(known.map(async x=>{
        try {return await getJSON(MAPS+encodeURIComponent(x.id),{
          headers:{'X-Goog-Api-Key':env.GOOGLE_MAPS_API_KEY,'X-Goog-FieldMask':placeMask}
        });}
        catch {return {id:x.id};}
      }))
    ]);
    const matrix=await routes(env.GOOGLE_MAPS_API_KEY,home,known);
    const now=local();
    const validSchedule=saved.date===now.date||saved.date===addDay(now.date);
    let busy=null,weather=null;
    if(validSchedule&&request) {
      try{
        const u=new URL(request.url);u.pathname='/api/calendar';u.searchParams.set('date',saved.date);
        const response=await calendarGet({...context,request:new Request(u.toString(),{method:'GET'})});
        if(response.ok){const d=await response.json();if(!d.partial)busy=ranges(d.events,saved.date);}
      }catch{}
      try{weather=await forecast(home);}catch{}
    }
    const weekday=local(new Date(saved.date+'T12:00:00Z')).weekday;
    const school=!['Sat','Sun'].includes(weekday) && (saved.options?.kids||0)>0;
    const night=Boolean(saved.options?.nightMode)&&saved.date===now.date;
    const earliest=saved.date===now.date?Math.max(now.minute+15,night?0:school?930:0):school?930:0;
    const facts=await venueFacts(env,known,{research:false});
    const items=known.map((x,i)=>{
      const data=details[i],route=matrix.get(i);
      if(!data?.displayName?.text||data.businessStatus==='CLOSED_PERMANENTLY'||!route||route.km>(saved.options?.maxKm||MAX_KM))return null;
      const latest=night?1440:saved.options?.mode==='couple'?1410:saved.options?.mode==='visits'?1290:1200;
      const slot=busy&&weather?scheduleFor({...data,category:x.category},route.minutes,saved.date,earliest,busy,weather,latest,night):null;
      const bestTime=slot?'Leave at '+hourText(slot.t):'No confirmed slot right now — Refresh Ideas';
      return {
        id:x.id,name:data.displayName.text,category:x.category||'Activity',
        bring:typeof x.bring==='string'?x.bring:'Water and weather-appropriate layers',
        reason:typeof x.reason==='string'?x.reason:'Family-friendly experience',
        address:data.formattedAddress||'',km:Math.round(route.km*10)/10,
        driveMinutes:route.minutes,website:data.websiteUri||'',mapsUrl:data.googleMapsUri||'',
        openingHours:openingLabel(data),hoursToday:hoursForDate(data.currentOpeningHours,saved.date).label,
        hoursDate:saved.date,hoursVerified:Boolean(slot?.hoursVerified),
        bestTime,departureMinute:slot?.t??null,weather:slot?.weather||'Check current forecast',
        ...factsDisplay(facts.get(x.id),saved.options?.adults||2,saved.options?.kids||0),
        attributions:(data.attributions||[]).map(p=>({provider:p.provider||'',uri:p.providerUri||''}))
      };
    }).filter(Boolean);
    return json({...saved,items,coverage:items.length});
  } catch {
    return json({error:'Could not load the current Google Maps details for saved activities. Try again later.'},502);
  }
}
