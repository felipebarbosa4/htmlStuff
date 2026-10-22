import {getJSON,local} from './shared.js';
import {safeSource} from './config.js';
import {originPoint} from './generate.js';

const FEED='https://ottawa.hasthings.com',TMDB='https://api.themoviedb.org/3';
const UA='FamilyDashPersonal/1.0 (+https://github.com/felipebarbosa4/htmlStuff)';
export const movieCredit={label:'This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.',url:'https://www.themoviedb.org/about/logos-attribution'};
export const eventCredit={label:'Data: Has Things (hasthings.com) · ODbL 1.0',url:'https://ottawa.hasthings.com/feeds#license'};
const caDate=iso=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso)).filter(x=>x.type!=='literal').reduce((p,x)=>(p[x.type]=x.value,p),{});
const monthEnd=month=>new Date(Date.parse((()=>{let [y,m]=month.split('-').map(Number);return (m===12?y+1:y)+'-'+String(m===12?1:m+1).padStart(2,'0')+'-01T00:00:00Z';})())-86400000).toISOString().slice(0,10);
const family=opts=>opts.kids>0&&opts.mode!=='couple';
const auth=token=>({Authorization:'Bearer '+token,accept:'application/json'});
const photoPath=p=>/^\/[A-Za-z0-9_-]+\.(?:jpg|png|webp)$/.test(p||'')?p:'';
const providerList=values=>[...new Map((Array.isArray(values)?values:[])
  .filter(x=>typeof x.provider_name==='string'&&Number.isInteger(x.provider_id))
  .sort((a,b)=>(a.display_priority||999)-(b.display_priority||999))
  .map(x=>[x.provider_id,String(x.provider_name).slice(0,45)])).values()].slice(0,5);
const videoLink=data=>{
  const list=Array.isArray(data?.results)?data.results:[];
  const valid=list.filter(x=>x.site==='YouTube'&&x.type==='Trailer'&&
    /^[A-Za-z0-9_-]{11}$/.test(x.key||''));
  valid.sort((a,b)=>Number(Boolean(b.official))-Number(Boolean(a.official))||
    Number(b.iso_639_1==='en')-Number(a.iso_639_1==='en'));
  return valid.length?'https://www.youtube.com/watch?v='+valid[0].key:'';
};
async function movieExtras(id,key){
  const [videos,providers]=await Promise.allSettled([
    getJSON(TMDB+'/movie/'+id+'/videos?language=en-US',{headers:auth(key)}),
    getJSON(TMDB+'/movie/'+id+'/watch/providers',{headers:auth(key)})
  ]);
  const ca=providers.status==='fulfilled'?providers.value.results?.CA:null;
  return {
    trailerUrl:videos.status==='fulfilled'?videoLink(videos.value):'',
    watch:{
      verified:providers.status==='fulfilled',
      subscription:providerList(ca?.flatrate),
      free:providerList([...(ca?.free||[]),...(ca?.ads||[])]),
      rent:providerList(ca?.rent),
      buy:providerList(ca?.buy),
      link:ca?.link&&/^https:\/\//.test(ca.link)?ca.link:''
    }
  };
}


export async function tmdbMovies(env,opts,now){
  const key=String(env.TMDB_API_KEY||'').trim();
  if(!key)throw Error('TMDB_API_KEY missing. Add a TMDB API Read Access Token to Cloudflare secrets.');
  const month=now.date.slice(0,7),u=new URL(TMDB+'/discover/movie');
  Object.entries({region:'CA',language:'en-CA','release_date.gte':month+'-01',
    'release_date.lte':monthEnd(month),with_release_type:'3|2',
    sort_by:'popularity.desc',include_adult:'false',page:'1'})
    .forEach(([k,v])=>u.searchParams.set(k,v));
  const data=await getJSON(u.toString(),{headers:auth(key)});
  const movies=(data.results||[]).filter(m=>Number.isInteger(m.id)&&m.id>0&&!m.adult)
    .slice(0,family(opts)?20:16);
  const results=await Promise.all(movies.map(async m=>{
    try{
      const details=await getJSON(TMDB+'/movie/'+m.id+'/release_dates',{headers:auth(key)});
      const release=details.results?.find(x=>x.iso_3166_1==='CA');
      const theatrical=(release?.release_dates||[]).filter(x=>
        [2,3].includes(x.type) && /^\d{4}-\d{2}-\d{2}/.test(x.release_date||'') &&
        x.release_date.slice(0,7)===month);
      if(!theatrical.length)return null;
      theatrical.sort((a,b)=>(a.type===3?0:1)-(b.type===3?0:1)||
        a.release_date.localeCompare(b.release_date));
      const certs=[...new Set(theatrical.map(x=>String(x.certification||'').trim().toUpperCase()).filter(Boolean))];
      if(family(opts) && (!certs.length||!certs.every(x=>['G','PG'].includes(x))))return null;
      const poster=photoPath(m.poster_path);
      return {id:'tmdb:'+m.id,kind:'movies',name:String(m.title||m.original_title||'').slice(0,105),
        releaseDate:theatrical[0].release_date.slice(0,10),
        rating:certs[0]||'Unverified',
        reason:String(m.overview||'Canadian theatrical release').slice(0,550),
        sourceUrl:'https://www.themoviedb.org/movie/'+m.id,
        posterUrl:poster?'https://image.tmdb.org/t/p/w342'+poster:'',
        provider:'TMDB'};
    }catch{return null;}
  }));
  const selected=results.filter(Boolean).sort((a,b)=>a.releaseDate.localeCompare(b.releaseDate)).slice(0,12);
  // Enrich ONLY retained movies to avoid an unnecessary 2x fanout for discarded titles.
  return Promise.all(selected.map(async movie=>{
    try{
      const extras=await movieExtras(Number(movie.id.slice(5)),key);
      return {...movie, ...extras, synopsis:movie.reason, reason:movie.reason.slice(0,115)};
    }catch{return {...movie,trailerUrl:'',watch:{verified:false,subscription:[],free:[],rent:[],buy:[],link:''},synopsis:movie.reason};}
  }));
}

async function eventsFor(date){
  const all=[];let offset=0;
  for(let i=0;i<2;i++){
    const url=new URL(FEED+'/api/events');
    Object.entries({date,limit:'100',offset:String(offset)}).forEach(([k,v])=>url.searchParams.set(k,v));
    const r=await getJSON(url.toString(),{headers:{'User-Agent':UA,accept:'application/json'}});
    if(!Array.isArray(r.items))throw Error('Ottawa Has Things API returned invalid events');
    all.push(...r.items);
    if(r.nextOffset==null||r.nextOffset<=offset)break;
    offset=r.nextOffset;
  }
  return all;
}
async function venue(slug){
  try{
    const result=await getJSON(FEED+'/api/venues/'+encodeURIComponent(slug),
      {headers:{'User-Agent':UA,accept:'application/json'}});
    const x=result.item;
    if(!x?.address||!Number.isFinite(x.latitude)||!Number.isFinite(x.longitude)||
       Math.abs(x.latitude)>90||Math.abs(x.longitude)>180)return null;
    return {slug,address:String(x.address).slice(0,190),name:String(x.name||'').slice(0,90),
      lat:x.latitude,lng:x.longitude};
  }catch{return null;}
}
function allowed(x,opts,day,nowMs){
  if(x?.status!=='scheduled'||!x.startTimeKnown||!x.startsAt||!x.venue?.slug||!safeSource(x.url))return false;
  if(family(opts)){
    if(/(?:18|19|21)\s*\+|adults only|mature/i.test(x.ageRestriction||''))return false;
    // Unknown family suitability isn't affirmative verification: exclude film, clubbing, mature comedy.
    if(['comedy','film','dj-party'].includes(x.category))return false;
  }
  if(opts.environment==='indoor'&&x.outdoors===true)return false;
  if(opts.environment==='outdoor'&&x.outdoors!==true)return false;
  const t=caDate(x.startsAt);
  if([t.year,t.month,t.day].join('-')!==day.date)return false;
  return new Date(x.startsAt).getTime()-nowMs>20*60000;
}
export async function hasThingsEvents(env,opts,day){
  if(!env.GOOGLE_MAPS_API_KEY||!env.HOME_ADDRESS)
    throw Error('Google Maps secrets required to confirm event driving distance');
  const nowMs=Date.now();
  const all=await eventsFor(day.date);
  const candidates=all.filter(x=>allowed(x,opts,day,nowMs))
    .sort((a,b)=>(Number(b.importance)||0)-(Number(a.importance)||0)).slice(0,35);
  if(!candidates.length)return [];
  const unique=[...new Set(candidates.map(x=>x.venue.slug))];
  const [locations,home]=await Promise.all([Promise.all(unique.map(venue)),originPoint(env)]);
  const byVenue=new Map(locations.filter(Boolean).map(v=>[v.slug,v]));
  const selected=candidates.filter(x=>byVenue.has(x.venue.slug)).slice(0,25);
  if(!selected.length)return [];
  const routes=await getJSON('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix',{
    method:'POST',headers:{'content-type':'application/json','X-Goog-Api-Key':env.GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask':'originIndex,destinationIndex,condition,distanceMeters,duration'},
    body:JSON.stringify({origins:[{waypoint:{location:{latLng:{latitude:home.lat,longitude:home.lng}}}}],
      destinations:selected.map(x=>{const v=byVenue.get(x.venue.slug);return {waypoint:{
        location:{latLng:{latitude:v.lat,longitude:v.lng}}}};}),
      travelMode:'DRIVE',routingPreference:'TRAFFIC_UNAWARE'})
  });
  if(!Array.isArray(routes))return [];
  const items=[];
  for(const r of routes){
    const src=selected[r.destinationIndex];
    if(!src||r.condition!=='ROUTE_EXISTS'||!Number.isFinite(r.distanceMeters)||
      r.distanceMeters>opts.maxKm*1000)continue;
    const minutes=Math.ceil(parseFloat(r.duration)/60);
    if(!Number.isFinite(minutes)||Date.parse(src.startsAt)<nowMs+(minutes+15)*60000)continue;
    const v=byVenue.get(src.venue.slug),start=caDate(src.startsAt);
    items.push({id:'hasthings:'+src.id,kind:'events',name:String(src.title||'').slice(0,110),
      date:[start.year,start.month,start.day].join('-'),time:start.hour+':'+start.minute,
      venue:v.name||src.venue.name,address:v.address,
      km:Math.round(r.distanceMeters/100)/10,driveMinutes:minutes,
      sourceUrl:safeSource(src.url),ticketUrl:safeSource(src.ticketUrl),
      reason:String(src.category||'Event')+' · '+(src.confidence==='confirmed'?'Confirmed listing':'Single-source listing'),
      ageRestriction:String(src.ageRestriction||'Not specified'),provider:'Has Things'});
  }
  items.sort((a,b)=>a.time.localeCompare(b.time)||a.km-b.km);
  return items.slice(0,8);
}