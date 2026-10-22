// Shared utilities for the What to Do feature. No residential address or keys in source.
export const ZONE = 'America/Toronto';
export const CACHE_KEY = 'family:activities:v1';
export const MAX_KM = 20;
export const json = (data, status=200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type':'application/json; charset=utf-8',
    'cache-control':'private, no-store, max-age=0',
    'x-content-type-options':'nosniff',
    'referrer-policy':'no-referrer'
  }
});
export function local(date=new Date()) {
  const obj = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit',
    weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return {date:obj.year+'-'+obj.month+'-'+obj.day,minute:Number(obj.hour)*60+Number(obj.minute),weekday:obj.weekday};
}
export function addDay(iso) {
  const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);
}
export function hourText(minutes) {
  const h=Math.floor(minutes/60)%24,m=minutes%60;
  return ((h%12)||12)+':'+String(m).padStart(2,'0')+(h>=12?' PM':' AM');
}
export function ranges(events,targetDate) {
  const busy=[];
  for(const e of events||[]) {
    // Family Dash What to Do: all-day calendar entries are informational,
    // not blockers. Only events with actual start/end times reserve time.
    if(e.allDay) continue;
    const start=new Date(e.start),end=new Date(e.end||e.start);
    if(!Number.isFinite(start.valueOf())||!Number.isFinite(end.valueOf()))continue;
    const a=local(start),b=local(end);
    if(a.date>targetDate||b.date<targetDate)continue;
    busy.push([a.date<targetDate?0:a.minute,b.date>targetDate?1440:b.minute]);
  }
  return busy;
}
export function openDuring(hours,date,arrival,departure) {
  if(!hours || !Array.isArray(hours.periods) || !hours.periods.length)return null;
  for(const period of hours.periods) {
    const a=period.open,b=period.close;
    if(!a?.date)continue;
    const start=[a.date.year,String(a.date.month).padStart(2,'0'),String(a.date.day).padStart(2,'0')].join('-');
    const end=b?.date?[b.date.year,String(b.date.month).padStart(2,'0'),String(b.date.day).padStart(2,'0')].join('-'):null;
    const minA=start<date?0:(start===date?a.hour*60+(a.minute||0):1440);
    const minB=!end?1440:end>date?1440:end===date?b.hour*60+(b.minute||0):0;
    if(minA<=arrival && minB>=departure)return true;
  }
  return false;
}
export function outdoorWeather(hours,date,minutes) {
  const key=date+'T'+String(Math.floor(minutes/60)).padStart(2,'0')+':00';
  const row=hours.find(x=>x.time===key) || hours.find(x=>x.time.startsWith(date+'T'));
  if(!row)return {ok:true,description:'Forecast unavailable',penalty:2};
  const rainy=Number(row.rain)>=55, windy=Number(row.wind)>=40;
  const severe=Number(row.temp)<-14||Number(row.temp)>34;
  const penalty=(rainy?5:0)+(windy?2:0)+(severe?4:0);
  return {ok:!severe && !rainy,description:Math.round(row.temp)+'°C · rain '+Math.round(row.rain)+'%',penalty};
}
export async function getJSON(url,options={}) {
  const {timeoutMs=14000,...fetchOptions}=options;
  const c=new AbortController(),timer=setTimeout(()=>c.abort(),Math.max(1000,Math.min(55000,timeoutMs)));
  try {
    const r=await fetch(url,{...fetchOptions,signal:c.signal});
    if(!r.ok)throw Error('Service HTTP '+r.status);
    return await r.json();
  } finally {clearTimeout(timer);}
}
