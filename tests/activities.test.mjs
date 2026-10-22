import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestPost,originPoint,scheduleFor,isNight,eligibleNightCategory} from '../functions/api/activities/generate.js';
import {onRequestGet} from '../functions/api/activities.js';
import {onRequestGet as photoGet} from '../functions/api/activities/photo.js';
import {ranges} from '../functions/api/activities/shared.js';
import {onRequestPost as savePreference,onRequestGet as listPreferences} from '../functions/api/activities/feedback.js';
import {onRequestPost as discover,onRequestGet as listedDiscovery} from '../functions/api/activities/discover.js';
import {tmdbMovies,movieOverviewPtBr,tmdbUserScore} from '../functions/api/activities/providers.js';
import {normalizeOptions,learnedCounts} from '../functions/api/activities/config.js';
import {hoursForDate} from '../functions/api/activities/hours.js';
import {sanitizeEnrichment,priceDisplay,factsDisplay,venueFacts} from '../functions/api/activities/enrich.js';

test('manual generation: GPT-6 Luna, real route threshold, KV persistence, photo attribution and throttle', async()=>{
  const OriginalDate=global.Date;
  const fixed=OriginalDate.parse('2026-10-20T16:30:00Z');
  global.Date=class extends OriginalDate {
    constructor(...args){super(...(args.length?args:[fixed]));}
    static now(){return fixed;}
  };
  const originalFetch=global.fetch;
  const values=new Map(),calls=[];
  const env={
    HOME_ADDRESS:'HOME_ADDRESS_FROM_SECRET_NOT_FROM_GIT',
    GOOGLE_MAPS_API_KEY:'not-real',
    OPENAI_API_KEY:'not-real',
    GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'test',GOOGLE_REFRESH_TOKEN:'test',
    ACTIVITIES_KV:{
      get:async(key,format)=>{const v=values.get(key);return format==='json'&&v?JSON.parse(v):v??null;},
      put:async(key,v)=>{values.set(key,v);}
    }
  };
  let counter=0;
  const response=data=>new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
  global.fetch=async(url,options={})=>{
    const uri=String(url);calls.push(uri);
    if(uri.startsWith('https://maps.googleapis.com/maps/api/geocode/json'))
      return response({status:'OK',results:[{geometry:{location:{lat:45.4,lng:-75.7}}}]});
    if(uri.startsWith('https://api.open-meteo.com/')){
      const time=[],temp=[],rain=[],wind=[];
      for(const day of ['2026-10-20','2026-10-21'])for(let i=0;i<24;i++){
        time.push(day+'T'+String(i).padStart(2,'0')+':00');
        temp.push(16);rain.push(10);wind.push(5);
      }
      return response({hourly:{time,temperature_2m:temp,precipitation_probability:rain,wind_speed_10m:wind}});
    }
    if(uri==='https://places.googleapis.com/v1/places:searchText') {
      const index=counter++;
      return response({places:Array.from({length:10},(_,i)=>({
        id:'place_'+index+'_'+i,displayName:{text:'Test Place '+index+' '+i},
        formattedAddress:'Public destination, Ottawa',location:{latitude:45.4,longitude:-75.7},
        businessStatus:'OPERATIONAL',rating:4.5,userRatingCount:100,
        googleMapsUri:'https://maps.google.com/',websiteUri:'https://example.org',
        currentOpeningHours:{periods:[{open:{date:{year:2026,month:10,day:1},hour:0,minute:0}}],
          weekdayDescriptions:['Tuesday: Open 24 hours']}
      }))});
    }
    if(uri.includes('distanceMatrix/v2:computeRouteMatrix')) {
      const destinations=JSON.parse(options.body).destinations;
      return response(destinations.map((_,i)=>({originIndex:0,destinationIndex:i,condition:'ROUTE_EXISTS',
        distanceMeters:1000+i*450,duration:(240+i*15)+'s'})));
    }
    if(uri==='https://oauth2.googleapis.com/token')return response({access_token:'test-token'});
    if(uri.includes('/calendar/v3/users/me/calendarList'))return response({items:[{id:'family',summary:'Family',accessRole:'reader'}]});
    if(uri.includes('/calendar/v3/calendars/family/events'))return response({items:[
      // This is an all-day event: it must never reserve the entire day.
      {id:'all-day-family-note',summary:'Family reminder',status:'confirmed',
        start:{date:'2026-10-20'},end:{date:'2026-10-21'}},
      // Timed events must still block outings for their full duration.
      {id:'timed-appointment',summary:'Appointment',status:'confirmed',
        start:{dateTime:'2026-10-20T19:30:00Z'},
        end:{dateTime:'2026-10-20T21:00:00Z'}}
    ]});
    if(uri==='https://api.openai.com/v1/responses') {
      assert.equal(JSON.parse(options.body).model,'gpt-6-luna');
      const body=JSON.parse(options.body);
      const input=body.input;
      assert.ok(!input.includes(env.HOME_ADDRESS), 'Do not send home address to AI');
      if(body.tools?.some(x=>x.type==='web_search')){
        const listed=JSON.parse(input.split('Venues: ')[1]);
        const source='https://www.ottawa.ca/parks/admission';
        return response({output:[{type:'web_search_call',action:{sources:[{url:source}]}},{type:'message',content:[{type:'output_text',
          text:JSON.stringify({items:listed.map(x=>({id:x.id,sourceUrl:source,
            highlights:['Brincar ao ar livre','Explorar jardins'],animals:['cabras'],why:'Explore este espaço público',locale:'pt-BR',
            admission:{free:false,adultCAD:10,childCAD:5,evidence:'Adult C$10.00 Child C$5.00 admission'}}))})}]}]});
      }
      assert.equal(body.reasoning.effort,'none');
      assert.match(input,/Brazilian Portuguese \(pt-BR\)/);
      assert.ok(!input.includes('Test Place'), 'Do not send Google Places data to AI for category ranking');
      const categories=['park','indoor','museum','recreation','library','animals'];
      return response({output:[{type:'message',content:[{type:'output_text',
        text:JSON.stringify({categories,notes:Object.fromEntries(categories.map(cat=>[cat,{bring:'Água e casaco',why:'Passeio divertido para as crianças'}]))})}]}]});
    }
    if(uri.includes('/media?maxWidthPx=720'))return response({photoUri:'https://lh3.googleusercontent.com/demo'});
    if(uri.startsWith('https://places.googleapis.com/v1/places/place_')) {
      if(options.headers?.['X-Goog-FieldMask']==='photos') {
        return response({photos:[{name:'places/place_0_0/photos/demo',googleMapsUri:'https://maps.google.com/photo-source',
          authorAttributions:[{displayName:'Photographer',uri:'https://example.org/credit'}]}]});
      }
      const id=decodeURIComponent(uri.split('/').pop());
      return response({id,displayName:{text:'Test Place '+id},formattedAddress:'Ottawa destination',
        businessStatus:'OPERATIONAL',googleMapsUri:'https://maps.google.com/',websiteUri:'https://example.org',
        currentOpeningHours:{periods:[{open:{date:{year:2026,month:10,day:1},hour:0,minute:0}}],
          weekdayDescriptions:['Tuesday: 24 hours']}});
    }
    throw Error('Unexpected mocked endpoint: '+uri);
  };
  try{
    const request=new Request('https://dashboard.example.org/api/activities/generate',{
      method:'POST',headers:{origin:'https://dashboard.example.org','content-type':'application/json','sec-fetch-site':'same-origin'},body:'{}'});
    const ctx={request,env};
    const generated=await onRequestPost(ctx);
    assert.equal(generated.status,200,await generated.clone().text()); // preserve response body
    const generatedData=await generated.json();
    assert.ok(generatedData.items.every(x=>x.bestTime==='Leave at 5:00 PM'),
      'all-day items must be ignored, but the 3:30–5:00 PM appointment must be avoided');
    const data=JSON.parse(values.get('family:activities:v2:family'));
    assert.equal(data.provider,'GPT-6 Luna');
    assert.equal(data.locale,'pt-BR');
    assert.ok(data.items.every(x=>x.bring.includes('Água')));
    assert.equal(data.items.length,8);
    assert.ok(data.items.every(x=>x.id && x.category && x.bring && x.reason));
    assert.ok(data.items.every(x=>!x.name&&!x.address&&!x.km&&!x.rating&&!x.openingHours),
      'Cache must not persist Google Maps content');
    assert.ok(new Set(data.items.map(x=>x.category)).size>=3,'variety must be enforced');
    assert.ok(!JSON.stringify(data).includes(env.HOME_ADDRESS));
    assert.equal(calls.filter(x=>x==='https://api.openai.com/v1/responses').length,3,'AI ranking plus two uncached web searches');
    assert.equal(generatedData.items[0].price.estimatedTotal,30);
    assert.ok(generatedData.items[0].highlights.includes('Brincar ao ar livre'));
    assert.equal(generatedData.items[0].factsLocale,'pt-BR');
    const pref=await savePreference({request:new Request('https://dashboard.example.org/api/activities/feedback',{
      method:'POST',headers:{origin:'https://dashboard.example.org','content-type':'application/json'},
      body:JSON.stringify({mode:'family',id:data.items[0].id,category:data.items[0].category,value:'visited'})
    }),env});
    assert.equal(pref.status,200);
    const storedFeedback=await listPreferences({env});
    assert.equal((await storedFeedback.json()).records[0].value,'visited');
    const beforeAI=calls.filter(x=>x==='https://api.openai.com/v1/responses').length;
    const beforeSearch=calls.filter(x=>x==='https://places.googleapis.com/v1/places:searchText').length;
    const read=await onRequestGet({env,request:new Request('https://dashboard.example.org/api/activities')});
    assert.equal(read.status,200);
    const hydrated=await read.json();
    assert.equal(hydrated.items.length,8);
    assert.ok(hydrated.items.every(x=>x.name && x.km<=20));
    assert.equal(calls.filter(x=>x==='https://api.openai.com/v1/responses').length,beforeAI,'GET must not invoke AI');
    assert.equal(hydrated.items[0].price.perPerson,7.5,'Cached admission average can be rehydrated without AI');
    const withoutKids=JSON.parse(values.get('family:activities:v2:family'));
    withoutKids.options.kids=0;
    await env.ACTIVITIES_KV.put('family:activities:v2:family',JSON.stringify(withoutKids));
    const freshForAdults=await onRequestGet({env,request:new Request('https://dashboard.example.org/api/activities')});
    const adultItems=(await freshForAdults.json()).items;
    assert.equal(adultItems[0].bestTime,'Leave at 12:45 PM',
      'Kids=No must use the current clock, not the 3:30 PM school restriction');
    assert.equal(adultItems[0].price.perPerson,10);
    assert.equal(calls.filter(x=>x==='https://api.openai.com/v1/responses').length,beforeAI,
      'Changing group size and rehydrating cached prices must not trigger web research');
    assert.equal(calls.filter(x=>x==='https://places.googleapis.com/v1/places:searchText').length,beforeSearch,
      'GET must not generate new suggestions');
    const p=await photoGet({request:new Request('https://dashboard.example.org/api/activities/photo?placeId='+data.items[0].id),env});
    assert.equal(p.status,200);
    const ph=await p.json();
    assert.equal(ph.credits[0].name,'Photographer');
    assert.equal(ph.sourceUrl,'https://maps.google.com/photo-source');
    const repeated=await onRequestPost({...ctx,request:new Request('https://dashboard.example.org/api/activities/generate',{
      method:'POST',headers:{origin:'https://dashboard.example.org','content-type':'application/json'},body:'{}'})});
    assert.equal(repeated.status,429);
    const denied=await onRequestPost({...ctx,request:new Request('https://dashboard.example.org/api/activities/generate',{method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'},body:'{}'})});
    assert.equal(denied.status,403);
  }finally{global.Date=OriginalDate;global.fetch=originalFetch;}
});

test('geocoding errors identify the provider status without disclosing home or API key', async()=>{
  const oldFetch=global.fetch;
  const env={HOME_ADDRESS:'PRIVATE HOME TEST ADDRESS',GOOGLE_MAPS_API_KEY:'PRIVATE_TEST_KEY'};
  try{
    for(const [status,expected] of [
      ['ZERO_RESULTS','verify HOME_ADDRESS spelling'],
      ['REQUEST_DENIED','check Geocoding API enabled'],
      ['OVER_DAILY_LIMIT','verify billing'],
      ['OVER_QUERY_LIMIT','requests quota reached']
    ]){
      global.fetch=async()=>new Response(JSON.stringify({status,error_message:'PRIVATE HOME TEST ADDRESS PRIVATE_TEST_KEY'}));
      await assert.rejects(()=>originPoint(env),e=>{
        assert.ok(e.message.includes(expected),e.message);
        assert.ok(!e.message.includes(env.HOME_ADDRESS));
        assert.ok(!e.message.includes(env.GOOGLE_MAPS_API_KEY));
        return true;
      });
    }
  }finally{global.fetch=oldFetch;}
});

test('all-day event ignored but timed appointment is a busy range',()=>{
  const events=[
    {allDay:true,start:'2026-10-20',end:'2026-10-21'},
    {allDay:false,start:'2026-10-20T19:30:00Z',end:'2026-10-20T21:00:00Z'}
  ];
  assert.deepEqual(ranges(events,'2026-10-20'),[[930,1020]]);
  assert.deepEqual(ranges([{allDay:true,start:'2026-10-20',end:'2026-10-21'}],'2026-10-20'),[]);
});

test('new mode inputs constrain party, environment and spending preference',()=>{
  assert.deepEqual(normalizeOptions({mode:'couple'}),{mode:'couple',adults:2,kids:0,environment:'all',budget:'any',maxKm:20});
  assert.deepEqual(normalizeOptions({mode:'visits',adults:14,kids:-7,environment:'outdoor',budget:'free'}),
    {mode:'visits',adults:8,kids:0,environment:'outdoor',budget:'free',maxKm:20});
  assert.equal(learnedCounts([{mode:'family',category:'park',value:'like'}, {mode:'couple',category:'park',value:'dislike'}],'family').park.liked,1);
});
test('TMDB uses Canadian theatrical releases and G/PG certification without OpenAI',async()=>{
  const oldFetch=global.fetch,OriginalDate=global.Date,calls=[],cache=new Map();
  const date=OriginalDate.parse('2026-10-21T15:00:00Z');
  global.Date=class extends OriginalDate{constructor(...x){super(...(x.length?x:[date]));}static now(){return date;}};
  const env={TMDB_API_KEY:'fake-tmdb-read-access-token',ACTIVITIES_KV:{
    get:async(k,fmt)=>fmt==='json'&&cache.get(k)?JSON.parse(cache.get(k)):cache.get(k)||null,
    put:async(k,v)=>cache.set(k,v)}};
  const response=x=>new Response(JSON.stringify(x),{headers:{'content-type':'application/json'}});
  try{
    global.fetch=async(url,options={})=>{
      const u=String(url);calls.push(u);
      assert.ok(!u.includes('api.openai.com'),'Movies must not invoke OpenAI');
      assert.equal(options.headers?.Authorization,'Bearer fake-tmdb-read-access-token');
      if(u.includes('/discover/movie')) {
        const p=new URL(u);
        assert.equal(p.searchParams.get('region'),'CA');
        assert.equal(p.searchParams.get('with_release_type'),'3|2');
        if(p.searchParams.get('release_date.gte')!=='2026-10-01')return response({results:[],total_pages:1});
        return response({results:[{id:1,title:'Family Film',poster_path:'/poster.jpg',overview:'Family adventure'},
          {id:2,title:'Adult Film',poster_path:'/adult.jpg'},
          {id:3,title:'Unrated Film',poster_path:null}]});
      }
      if(u.includes('/movie/')&&u.includes('append_to_response=')){
        const id=Number(new URL(u).pathname.split('/')[3]);
        const cert=id===1?'PG':id===2?'14A':'';
        assert.equal(new URL(u).searchParams.get('append_to_response'),'release_dates,videos,watch/providers,translations');
        return response({overview:'An adventure from the TMDB synopsis.',vote_average:8.14,vote_count:320,
          translations:{translations:[{iso_639_1:'pt',iso_3166_1:'BR',data:{overview:'Uma aventura em português brasileiro.'}}]},
          release_dates:{results:[{iso_3166_1:'CA',
            release_dates:[{type:3,release_date:'2026-10-09T00:00:00Z',certification:cert}]}]},
          videos:{results:[{site:'YouTube',type:'Trailer',official:true,key:'dQw4w9WgXcQ'}]},
          'watch/providers':{results:{CA:{link:'https://www.themoviedb.org/movie/1/watch?locale=CA',
            flatrate:[{provider_id:8,provider_name:'Netflix',display_priority:1}],
            rent:[{provider_id:10,provider_name:'Apple TV Store',display_priority:2}],buy:[]}}}});
      }
      throw Error('Unexpected '+u);
    };
    const request=new Request('https://dashboard.example.org/api/activities/discover',{
      method:'POST',headers:{origin:'https://dashboard.example.org','content-type':'application/json'},
      body:JSON.stringify({kind:'movies',mode:'family'})});
    const r=await discover({request,env});
    assert.equal(r.status,200,await r.clone().text());
    const result=await r.json();
    assert.deepEqual(result.items.map(x=>x.name),['Family Film']);
    assert.equal(result.items[0].rating,'PG');
    assert.equal(calls.filter(x=>x.includes('/movie/1?append_to_response')).length,1);
    assert.equal(result.items[0].synopsis,'Uma aventura em português brasileiro.');
    assert.equal(result.items[0].synopsisLocale,'pt-BR');
    assert.equal(result.items[0].userScorePercent,81);
    assert.equal(result.items[0].userScoreVotes,320);
    assert.equal(result.items[0].metadataVersion,2);
    assert.equal(result.items[0].posterUrl,'https://image.tmdb.org/t/p/w342/poster.jpg');
    assert.equal(result.items[0].trailerUrl,'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.deepEqual(result.items[0].watch.subscription,['Netflix']);
    assert.deepEqual(result.items[0].watch.rent,['Apple TV Store']);
    assert.equal(result.items[0].watch.verified,true);
    assert.equal(result.sourceCredit.url,'https://www.themoviedb.org/about/logos-attribution');
    const read=await listedDiscovery({request:new Request('https://dashboard.example.org/api/activities/discover?kind=movies&mode=family'),env});
    assert.equal((await read.json()).items.length,1);
    assert.ok(calls.every(x=>x.startsWith('https://api.themoviedb.org/')));
  }finally{global.fetch=oldFetch;global.Date=OriginalDate;}
});
test('Movies fail clearly without a TMDB key and never fall back to billable OpenAI',async()=>{
  const env={ACTIVITIES_KV:{get:async()=>null,put:async()=>{}}};
  const r=await discover({request:new Request('https://dashboard.example.org/api/activities/discover',{
    method:'POST',headers:{origin:'https://dashboard.example.org','content-type':'application/json'},
    body:JSON.stringify({kind:'movies'})}),env});
  assert.equal(r.status,503);
  assert.match((await r.json()).error,/TMDB_API_KEY/);
});
test('Has Things events use its official venue coordinates, check routes, age/time and avoid OpenAI when enough events',async()=>{
  const oldFetch=global.fetch,OriginalDate=global.Date,cache=new Map(),calls=[];
  const date=OriginalDate.parse('2026-10-21T15:00:00Z');
  global.Date=class extends OriginalDate{constructor(...x){super(...(x.length?x:[date]));}static now(){return date;}};
  const env={HOME_ADDRESS:'PRIVATE',GOOGLE_MAPS_API_KEY:'map-key',OPENAI_API_KEY:'openai-key',
    ACTIVITIES_KV:{get:async(k,f)=>f==='json'&&cache.get(k)?JSON.parse(cache.get(k)):cache.get(k)||null,
      put:async(k,v)=>cache.set(k,v)}};
  const response=x=>new Response(JSON.stringify(x),{headers:{'content-type':'application/json'}});
  try{
    global.fetch=async(url,options={})=>{
      const u=String(url);calls.push(u);
      if(u.includes('ottawa.hasthings.com/api/events?')){
        return response({items:[
          {id:'a',title:'Family Sports',category:'sports',status:'scheduled',startTimeKnown:true,
            startsAt:'2026-10-21T22:00:00Z',ageRestriction:'All ages',importance:30,
            venue:{slug:'venue-a'},url:'https://ottawa.hasthings.com/events/family-sports'},
          {id:'b',title:'Art Exhibition',category:'art',status:'scheduled',startTimeKnown:true,
            startsAt:'2026-10-21T23:00:00Z',importance:25,
            venue:{slug:'venue-b'},url:'https://ottawa.hasthings.com/events/art-exhibition'},
          {id:'c',title:'Theatre',category:'theatre',status:'scheduled',startTimeKnown:true,
            startsAt:'2026-10-21T22:30:00Z',importance:20,
            venue:{slug:'venue-c'},url:'https://ottawa.hasthings.com/events/theatre'},
          {id:'d',title:'Nightclub',category:'dj-party',status:'scheduled',startTimeKnown:true,
            startsAt:'2026-10-21T23:00:00Z',importance:90,ageRestriction:'19+',
            venue:{slug:'venue-d'},url:'https://ottawa.hasthings.com/events/nightclub'}
        ],nextOffset:null});
      }
      if(u.includes('ottawa.hasthings.com/api/venues/'))
        return response({item:{slug:u.split('/').pop(),name:'Sample Venue',
          address:'1074 Bank Street, Ottawa, ON K1S 3X3',latitude:45.39,longitude:-75.68}});
      if(u.startsWith('https://maps.googleapis.com/maps/api/geocode/json'))
        return response({status:'OK',results:[{geometry:{location:{lat:45.36,lng:-75.7}}}]});
      if(u.includes('/distanceMatrix/v2:computeRouteMatrix')){
        const destinations=JSON.parse(options.body).destinations;
        return response(destinations.map((_,i)=>({originIndex:0,destinationIndex:i,condition:'ROUTE_EXISTS',
          distanceMeters:5000+i*1000,duration:'900s'})));
      }
      throw Error('Unexpected '+u);
    };
    const request=new Request('https://dashboard.example.org/api/activities/discover',{
      method:'POST',headers:{origin:'https://dashboard.example.org','content-type':'application/json'},
      body:JSON.stringify({kind:'events',mode:'family',maxKm:10})});
    const r=await discover({request,env});
    assert.equal(r.status,200,await r.clone().text());
    const data=await r.json();
    assert.equal(data.items.length,3);
    assert.ok(data.items.every(x=>x.km<=10 && x.provider==='Has Things'));
    assert.ok(data.items.every(x=>x.name!=='Nightclub'));
    assert.equal(data.sourceCredit.label,'Data: Has Things (hasthings.com) · ODbL 1.0');
    assert.ok(calls.every(x=>!x.includes('api.openai.com')));
    assert.ok(calls.some(x=>x.includes('ottawa.hasthings.com/api/venues')));
  }finally{global.fetch=oldFetch;global.Date=OriginalDate;}
});
test('couple evenings remain possible after 8 PM, while family hours end earlier',()=>{
  const place={category:'food',currentOpeningHours:{periods:[{
    open:{date:{year:2026,month:10,day:21},hour:0,minute:0},
    close:{date:{year:2026,month:10,day:22},hour:0,minute:0}
  }]}};
  const hours=[{time:'2026-10-21T20:00',temp:12,rain:10,wind:5}];
  assert.equal(scheduleFor(place,10,'2026-10-21',1215,[],hours,1200),null);
  const couple=scheduleFor(place,10,'2026-10-21',1215,[],hours,1410);
  assert.ok(couple&&couple.t>=1215,'a couple may still go out after 8 PM');
});

test('radius choices are constrained and request options are normalized',()=>{
  for(const maxKm of [5,10,20,30,50])assert.equal(normalizeOptions({maxKm}).maxKm,maxKm);
  for(const invalid of [0,25,200,-10,'fake'])assert.equal(normalizeOptions({maxKm:invalid}).maxKm,20);
});
test('nighttime suggestions exclude parks and require confirmed open hours',()=>{
  assert.equal(isNight(22*60),true);
  assert.equal(isNight(19*60+59),false);
  assert.equal(isNight(2*60),true);
  assert.equal(eligibleNightCategory('park'),false);
  assert.equal(eligibleNightCategory('food'),true);
  const date='2026-10-21';
  const forecast=[{time:date+'T22:00',temp:9,rain:0,wind:0}];
  const closed={category:'food',currentOpeningHours:{periods:[{
    open:{date:{year:2026,month:10,day:21},hour:10,minute:0},
    close:{date:{year:2026,month:10,day:21},hour:21,minute:0}
  }]}};
  const opened={category:'food',currentOpeningHours:{periods:[{
    open:{date:{year:2026,month:10,day:21},hour:17,minute:0},
    close:{date:{year:2026,month:10,day:22},hour:0,minute:0}
  }]}};
  assert.equal(scheduleFor(closed,8,date,22*60,[],forecast,1440,true),null);
  assert.ok(scheduleFor(opened,8,date,22*60,[],forecast,1440,true));
  assert.equal(scheduleFor({category:'park',currentOpeningHours:opened.currentOpeningHours},8,date,22*60,[],forecast,1440,true),null);
  assert.equal(scheduleFor({category:'indoor'},8,date,22*60,[],forecast,1440,true),null,
    'Unknown opening hours must not count as definitely open');
});

test('date-specific opening hours respect split shifts, overnight hours and unverifiable dates',()=>{
  const date='2026-10-22',point=(d,h,m=0)=>({date:{year:2026,month:10,day:Number(d)},hour:h,minute:m});
  const hours={periods:[
    {open:point(21,20),close:point(22,2)},
    {open:point(22,9),close:point(22,12)},
    {open:point(22,13),close:point(22,17)}
  ]};
  assert.equal(hoursForDate(hours,date,date).label,
    '12:00 AM – 2:00 AM / 9:00 AM – 12:00 PM / 1:00 PM – 5:00 PM');
  const closed=hoursForDate({periods:[]},date,date);
  assert.match(closed.label,/Closed/);
  assert.equal(hoursForDate(null,date,date).verified,false);
  assert.equal(hoursForDate(hours,'2026-10-20',date).verified,false);
  assert.equal(hoursForDate({periods:[{open:point(22,0)}]},date,date).label,'Open 24 hours');
});

test('TMDB fetches up to 12 distinct CA theatrical movies, prioritizes month and backfills recent G/PG',async()=>{
  const oldFetch=global.fetch,OriginalDate=global.Date, calls=[];
  const date=OriginalDate.parse('2026-10-22T15:00:00Z');
  global.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:[date]));}static now(){return date;}};
  try{
    global.fetch=async(url,options={})=>{
      const u=new URL(String(url));calls.push(u.href);
      assert.equal(options.headers?.Authorization,'Bearer tmdb-token');
      assert.equal(u.hostname,'api.themoviedb.org','TMDB must not call OpenAI');
      if(u.pathname==='/3/discover/movie'){
        assert.equal(u.searchParams.get('region'),'CA');
        assert.equal(u.searchParams.get('with_release_type'),'3|2');
        const current=u.searchParams.get('release_date.gte')==='2026-10-01';
        // Only three of this month's candidates are family certified.
        if(current)return new Response(JSON.stringify({results:[1,2,3].map(id=>({id,title:'This month '+id})),total_pages:1}));
        return new Response(JSON.stringify({results:Array.from({length:18},(_,i)=>({id:i+4,title:'Recent title '+i})),total_pages:1}));
      }
      if(u.pathname.startsWith('/3/movie/')){
        assert.equal(u.searchParams.get('append_to_response'),'release_dates,videos,watch/providers,translations');
        const id=Number(u.pathname.split('/')[3]);
        const recent=id>3;
        return new Response(JSON.stringify({overview:'Verified from TMDB',vote_average:7.7,vote_count:123,
          translations:{translations:[{iso_639_1:'pt',iso_3166_1:'BR',data:{overview:'Sinopse brasileira verificada'}}]},release_dates:{results:[{
          iso_3166_1:'CA',release_dates:[{type:3,release_date:recent?'2026-09-10T00:00:00Z':'2026-10-10T00:00:00Z',certification:'PG'}]
        }]},'watch/providers':{results:{}},videos:{results:[]}}));
      }
      throw Error('Unexpected '+u.href);
    };
    const result=await tmdbMovies({TMDB_API_KEY:'tmdb-token'},{mode:'family',kids:2}, {date:'2026-10-22'});
    assert.equal(result.length,12);
    assert.equal(new Set(result.map(x=>x.id)).size,12);
    assert.ok(result.slice(0,3).every(x=>x.releaseDate==='2026-10-10'));
    assert.ok(result.slice(3).every(x=>x.releaseDate==='2026-09-10'));
    assert.ok(result.every(x=>x.rating==='PG'));
    assert.ok(result.every(x=>x.userScorePercent===77&&x.synopsis==='Sinopse brasileira verificada'));
    assert.ok(calls.some(x=>x.includes('release_date.gte=2026-10-01')));
    assert.ok(calls.some(x=>x.includes('release_date.gte=2026-06')));
    assert.ok(!calls.some(x=>x.includes('api.openai.com')));
  }finally{global.fetch=oldFetch;global.Date=OriginalDate;}
});
test('TMDB returns truthful count when fewer than nine age-verified Canadian films exist',async()=>{
  const oldFetch=global.fetch;
  try{
    global.fetch=async(url)=>{
      const u=new URL(String(url));
      if(u.pathname==='/3/discover/movie')return new Response(JSON.stringify({results:[{id:333,title:'One Film'}],total_pages:1}));
      if(u.pathname==='/3/movie/333')return new Response(JSON.stringify({release_dates:{results:[{iso_3166_1:'CA',release_dates:[{type:3,release_date:'2026-10-15T00:00:00Z',certification:'PG'}]}]}}));
      throw Error('Unexpected request');
    };
    const items=await tmdbMovies({TMDB_API_KEY:'token'},{mode:'family',kids:2},{date:'2026-10-22'});
    assert.equal(items.length,1);
  }finally{global.fetch=oldFetch;}
});

test('venue price facts reject uncited claims and unsupported pricing evidence',()=>{
  const url='https://ottawa.ca/en/recreation-and-parks/visiting';
  const good={id:'abc',sourceUrl:url,highlights:['Playground','Waterfront path'],animals:['goats'],why:'Walk and play',
    admission:{adultCAD:16,childCAD:8,free:false,evidence:'Adult C$16.00; Children C$8.00'}};
  assert.equal(sanitizeEnrichment(good,new Set()),null,'No cited source means no published claims');
  const verified=sanitizeEnrichment(good,new Set([url]));
  assert.equal(verified.admission.type,'priced');
  assert.equal(priceDisplay(verified,2,2).perPerson,12);
  assert.equal(priceDisplay(verified,2,0).perPerson,16);
  assert.equal(priceDisplay(verified,4,2).estimatedTotal,80);
  const unproved=sanitizeEnrichment({...good,admission:{...good.admission,evidence:'See membership portal'}},new Set([url]));
  assert.equal(unproved.admission.type,'unverified','Price must have matching evidence');
  assert.equal(factsDisplay(unproved).price.perPerson,null);
  assert.equal(sanitizeEnrichment({...good,sourceUrl:'http://example.com'},new Set([url])),null);
  const free=sanitizeEnrichment({...good,admission:{free:true,evidence:'Free admission all year'}},new Set([url]));
  assert.equal(free.admission.type,'free');
  assert.equal(priceDisplay(free).perPerson,0);
});
test('Kids Yes/No overrides legacy family counts without changing adult defaults',()=>{
  assert.equal(normalizeOptions({mode:'family',kidsYes:false,kids:2}).kids,0);
  assert.equal(normalizeOptions({mode:'family',kidsYes:true,kids:0}).kids,2);
  assert.equal(normalizeOptions({mode:'family',kidsYes:false}).adults,2);
  assert.equal(normalizeOptions({mode:'visits',kidsYes:true}).adults,4);
});

test('cached venue descriptions are translated once on Refresh without re-researching ticket prices',async()=>{
  const oldFetch=global.fetch,cache=new Map(),calls=[];
  const id='place_cache_1',source='https://ottawa.ca/en/parks/visitor-info';
  const old={highlights:['Walk through gardens'],animals:['goats'],why:'A lovely place to spend the afternoon',
    sourceUrl:source,admission:{type:'priced',adultCAD:18,childCAD:7},checkedAt:'2026-10-21T18:00:00Z'};
  cache.set('family:activities:verified-venue:v1:'+id,JSON.stringify(old));
  const env={OPENAI_API_KEY:'secret',ACTIVITIES_KV:{
    get:async(k,f)=>{const v=cache.get(k);return f==='json'&&v?JSON.parse(v):v||null;},
    put:async(k,v)=>cache.set(k,v)
  }};
  global.fetch=async(url,opts={})=>{
    calls.push(String(url));
    const body=JSON.parse(opts.body);
    assert(!body.tools,'Translation must not pay for a web search');
    assert.match(body.input,/português brasileiro/);
    return new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({items:[{
      id,highlights:['Passear pelos jardins'],animals:['cabras'],why:'Uma ótima opção para a tarde'
    }]})}]}]}),{status:200});
  };
  try{
    const first=await venueFacts(env,[{id,name:'Example Venue',category:'park'}],{research:true});
    const fact=first.get(id);
    assert.equal(fact.locale,'pt-BR');
    assert.deepEqual(fact.animals,['cabras']);
    assert.equal(fact.admission.adultCAD,18);
    assert.equal(fact.sourceUrl,source);
    assert.equal(priceDisplay(fact,2,2).estimatedTotal,50);
    assert.equal(calls.length,1);
    const read=await venueFacts(env,[{id}],{research:false});
    assert.equal(read.get(id).why,'Uma ótima opção para a tarde');
    assert.equal(calls.length,1);
    await venueFacts(env,[{id,name:'Example Venue',category:'park'}],{research:true});
    assert.equal(calls.length,1,'Translated cache stays valid without new AI calls');
  }finally{global.fetch=oldFetch;}
});

test('TMDB rating is user score 0–10 converted to percent only with votes, never age certification',()=>{
  assert.deepEqual(tmdbUserScore({vote_average:8.1,vote_count:502},{}),{percent:81,votes:502});
  assert.deepEqual(tmdbUserScore({vote_average:0,vote_count:0},{}),{percent:null,votes:0});
  assert.deepEqual(tmdbUserScore({vote_average:9.9,vote_count:0},{}),{percent:null,votes:0});
  assert.deepEqual(tmdbUserScore({vote_average:11,vote_count:8},{}),{percent:null,votes:0});
  assert.deepEqual(tmdbUserScore({}, {vote_average:7.6,vote_count:15}),{percent:76,votes:15});
});
test('TMDB pt-BR overview uses published Brazil translation and never pretends English text is translated',()=>{
  const details={overview:'An English description.',translations:{translations:[
    {iso_639_1:'pt',iso_3166_1:'PT',data:{overview:'Um filme em português de Portugal'}},
    {iso_639_1:'pt',iso_3166_1:'BR',data:{overview:'Uma sinopse em português brasileiro.'}}
  ]}};
  assert.deepEqual(movieOverviewPtBr(details),{text:'Uma sinopse em português brasileiro.',locale:'pt-BR'});
  const missing=movieOverviewPtBr({overview:'English-only original',translations:{translations:[]}});
  assert.equal(missing.locale,'pt-BR');
  assert.equal(missing.available,false);
  assert.match(missing.text,/não disponível/);
  assert.ok(!missing.text.includes('English-only'));
});
test('saved TMDB movie backfill keeps prior-month films on GET without a second API call',async()=>{
  const current='2026-10-12',prior='2026-09-11';
  const saved={kind:'movies',items:[{name:'October movie',releaseDate:current},
    {name:'September movie',releaseDate:prior}]};
  const env={ACTIVITIES_KV:{get:async(k)=>k.endsWith('tmdb-v3:family')?saved:null}};
  const res=await listedDiscovery({request:new Request('https://dashboard.example.org/api/activities/discover?kind=movies&mode=family'),env});
  assert.equal(res.status,200);
  const data=await res.json();
  assert.equal(data.items.length,2);
  assert.deepEqual(data.items.map(x=>x.releaseDate),[current,prior]);
});
