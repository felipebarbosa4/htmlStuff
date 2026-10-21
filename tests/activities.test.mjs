import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestPost} from '../functions/api/activities/generate.js';
import {onRequestGet} from '../functions/api/activities.js';
import {onRequestGet as photoGet} from '../functions/api/activities/photo.js';

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
    if(uri.includes('/calendar/v3/calendars/family/events'))return response({items:[]});
    if(uri==='https://api.openai.com/v1/responses') {
      assert.equal(JSON.parse(options.body).model,'gpt-6-luna');
      assert.equal(JSON.parse(options.body).reasoning.effort,'none');
      const input=JSON.parse(options.body).input;
      assert.ok(!input.includes('Test Place'), 'Do not send Google Places data to AI');
      assert.ok(!input.includes(env.HOME_ADDRESS), 'Do not send home address to AI');
      const categories=['park','indoor','museum','recreation','library','animals'];
      return response({output:[{type:'message',content:[{type:'output_text',
        text:JSON.stringify({categories,notes:Object.fromEntries(categories.map(cat=>[cat,{bring:'Water, jacket',why:'Fun for two kids'}]))})}]}]});
    }
    if(uri.includes('/media?maxWidthPx=720'))return response({photoUri:'https://lh3.googleusercontent.com/demo'});
    if(uri.startsWith('https://places.googleapis.com/v1/places/place_')) {
      if(options.headers?.['X-Goog-FieldMask']==='photos,attributions') {
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
    assert.equal(generated.status,200,await generated.text().catch(()=>'')); // failure includes error details
    const data=JSON.parse(values.get('family:activities:v1'));
    assert.equal(data.provider,'GPT-6 Luna');
    assert.equal(data.items.length,8);
    assert.ok(data.items.every(x=>x.id && x.category && x.bring && x.reason));
    assert.ok(data.items.every(x=>!x.name&&!x.address&&!x.km&&!x.rating&&!x.openingHours),
      'Cache must not persist Google Maps content');
    assert.ok(new Set(data.items.map(x=>x.category)).size>=3,'variety must be enforced');
    assert.ok(!JSON.stringify(data).includes(env.HOME_ADDRESS));
    assert.equal(calls.filter(x=>x==='https://api.openai.com/v1/responses').length,1);
    const beforeAI=calls.filter(x=>x==='https://api.openai.com/v1/responses').length;
    const beforeSearch=calls.filter(x=>x==='https://places.googleapis.com/v1/places:searchText').length;
    const read=await onRequestGet({env,request:new Request('https://dashboard.example.org/api/activities')});
    assert.equal(read.status,200);
    const hydrated=await read.json();
    assert.equal(hydrated.items.length,8);
    assert.ok(hydrated.items.every(x=>x.name && x.km<=20));
    assert.equal(calls.filter(x=>x==='https://api.openai.com/v1/responses').length,beforeAI,'GET must not invoke AI');
    assert.equal(calls.filter(x=>x==='https://places.googleapis.com/v1/places:searchText').length,beforeSearch,
      'GET must not generate new suggestions');
    const p=await photoGet({request:new Request('https://dashboard.example.org/api/activities/photo?placeId='+data.items[0].id),env});
    assert.equal(p.status,200);
    const ph=await p.json();
    assert.equal(ph.credits[0].name,'Photographer');
    assert.equal(ph.sourceUrl,'https://maps.google.com/photo-source');
    const repeated=await onRequestPost(ctx);
    assert.equal(repeated.status,429);
    const denied=await onRequestPost({...ctx,request:new Request('https://dashboard.example.org/api/activities/generate',{method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'},body:'{}'})});
    assert.equal(denied.status,403);
  }finally{global.Date=OriginalDate;global.fetch=originalFetch;}
});
