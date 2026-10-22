import {getJSON} from './shared.js';
import {safeSource} from './config.js';

// Only independently sourced venue information is cached, keyed by the
// Google Place ID. Never persist Google Places descriptions, prices or URLs.
const PREFIX='family:activities:verified-venue:v1:';
const TTL=30*86400;
const permittedLink=u=>{
  const url=safeSource(u);
  if(!url)return '';
  try{const p=new URL(url);return /\.(?:pdf|html?)$/i.test(p.pathname)||p.pathname.length<500?url:'';}catch{return '';}
};
const normalized=u=>{try{const p=new URL(u);p.hash='';return p.href.replace(/\/$/,'');}catch{return '';}};
function sources(data){
  const links=new Set();
  for(const x of data.output||[]){
    for(const s of x.action?.sources||[])if(permittedLink(s.url))links.add(normalized(s.url));
    for(const c of x.content||[])for(const a of c.annotations||[])if(permittedLink(a.url))links.add(normalized(a.url));
  }
  return links;
}
function parse(data){
  const text=String(data.output_text||(data.output||[]).flatMap(x=>(x.content||[]).map(c=>c.text||'')).join('\n')).trim()
    .replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try{return JSON.parse(text);}catch{
    const a=text.indexOf('{'),b=text.lastIndexOf('}');
    if(a<0||b<a)return {};
    try{return JSON.parse(text.slice(a,b+1));}catch{return {};}
  }
}
function number(x){
  if(x===null||x===undefined||x==='')return null;
  const n=Number(x);return Number.isFinite(n)&&n>=0&&n<=1000?Math.round(n*100)/100:null;
}
export function sanitizeEnrichment(item,validSources){
  if(!item||typeof item.id!=='string')return null;
  const source=permittedLink(item.sourceUrl);
  if(!source||!validSources.has(normalized(source)))return null;
  const highlights=Array.isArray(item.highlights)?item.highlights
    .filter(x=>typeof x==='string').map(x=>x.trim().slice(0,72)).filter(Boolean).slice(0,3):[];
  const animals=Array.isArray(item.animals)?item.animals.filter(x=>typeof x==='string')
    .map(x=>x.trim().slice(0,42)).filter(Boolean).slice(0,5):[];
  const why=typeof item.why==='string'?item.why.trim().slice(0,170):'';
  const money=item.admission||{};
  const evidence=String(money.evidence||'').slice(0,160);
  const normalizedEvidence=evidence.toLowerCase();
  const claimedFree=/\b(?:free admission|free entry|no admission fee|admission is free)\b/.test(normalizedEvidence);
  const free=money.free===true&&claimedFree;
  const adult=free?0:number(money.adultCAD),child=free?0:number(money.childCAD);
  const includesAmount=n=>n!==null && (normalizedEvidence.includes(n.toFixed(2)) || new RegExp('(?:^|[^\d])'+String(n).replace('.','\\.')+'(?:[^\d]|$)').test(normalizedEvidence));
  const type=free?'free':includesAmount(adult)&&includesAmount(child)?'priced':'unverified';
  return {highlights,animals,why,locale:item.locale==='pt-BR'?'pt-BR':'',sourceUrl:source,
    admission:{type,adultCAD:type==='priced'?adult:null,childCAD:type==='priced'?child:null},
    checkedAt:new Date().toISOString()};
}
function validStored(v){return Boolean(v&&Array.isArray(v.highlights)&&Array.isArray(v.animals)&&
  v.admission&&['free','priced','unverified'].includes(v.admission.type)&&permittedLink(v.sourceUrl));}
export async function venueFacts(env,places,{research=false}={}){
  const results=new Map();
  if(!env.ACTIVITIES_KV||!places?.length)return results;
  const unique=[...new Map(places.filter(x=>x?.id).map(x=>[x.id,x])).values()].slice(0,8);
  const cached=await Promise.all(unique.map(async p=>{
    try{const result=await env.ACTIVITIES_KV.get(PREFIX+p.id,'json');return validStored(result)||result?.unavailable===true?result:null;}
    catch{return null;}
  }));
  unique.forEach((p,i)=>{if(cached[i])results.set(p.id,cached[i]);});
  if(!research||!env.OPENAI_API_KEY)return results;
  // v1 cache entries already have cited official facts/prices. Translate only
  // their descriptive text; never pay for another web search or modify prices.
  const older=unique.filter(p=>validStored(results.get(p.id))&&results.get(p.id).locale!=='pt-BR');
  if(older.length){
    try{
      const source=older.map(p=>({id:p.id,highlights:results.get(p.id).highlights,
        animals:results.get(p.id).animals,why:results.get(p.id).why}));
      const data=await getJSON('https://api.openai.com/v1/responses',{
        method:'POST',timeoutMs:16000,
        headers:{'content-type':'application/json',authorization:'Bearer '+env.OPENAI_API_KEY},
        body:JSON.stringify({model:'gpt-6-luna',reasoning:{effort:'none'},store:false,max_output_tokens:1200,
          input:'Traduza fielmente para português brasileiro (pt-BR) os campos highlights, animals e why desta lista JSON. '+
            'NÃO acrescente nem invente atrações, espécies ou fatos, NÃO altere IDs. '+
            'Mantenha nomes próprios. Devolva só JSON no formato {"items":[{"id":"...","highlights":["..."],"animals":["..."],"why":"..."}]}. '+JSON.stringify(source)})
      });
      const parsed=parse(data),allowed=new Set(older.map(x=>x.id));
      for(const row of Array.isArray(parsed.items)?parsed.items:[]){
        if(!allowed.has(row?.id)||!Array.isArray(row.highlights)||!Array.isArray(row.animals)||typeof row.why!=='string')continue;
        const prior=results.get(row.id);
        if(row.highlights.length!==prior.highlights.length||row.animals.length!==prior.animals.length)continue;
        const translated={...prior,highlights:row.highlights.map(x=>String(x).slice(0,72)),
          animals:row.animals.map(x=>String(x).slice(0,42)),why:row.why.slice(0,170),locale:'pt-BR'};
        results.set(row.id,translated);
        try{await env.ACTIVITIES_KV.put(PREFIX+row.id,JSON.stringify(translated),{expirationTtl:TTL});}catch{}
      }
    }catch{/* Keep verified English descriptions if the translator is unavailable. */}
  }
  const missing=unique.filter(p=>!results.has(p.id));
  const groups=Array.from({length:Math.ceil(missing.length/4)},(_,i)=>missing.slice(i*4,i*4+4));
  await Promise.all(groups.map(async group=>{
    // Venue names are public proper nouns for independent source discovery;
    // do not supply Maps ratings, addresses, hours, descriptions or photos.
    const prompt='Research official websites or authoritative owner-operated pages for these named attractions in Ottawa, Ontario. '+
      'Find real visitor activities, and if the venue has live animals list ONLY confirmed animal types (not inferred). '+
      'Find CURRENT published admission prices in CAD per adult and per child (approximately age 5-8), or confirmed free admission. '+
      'Do not confuse restaurant meal costs, donations, parking charges, price-level badges, seasonal ticket prices or memberships with admission. '+
      'For free admission set free:true only with an explicit confirming source. If price is not published omit it. '+
      'For each venue return ONE official source URL containing the relevant facts. Do not invent attractions, animals or prices. '+
      'If you claim a price or free entry include admission.evidence (short copied price phrase from same official source). '+
      'Write highlights, animals and why exclusively in natural Brazilian Portuguese (pt-BR), retaining proper nouns. '+
      'Keep numeric prices and their evidence in the original source language. Set locale to pt-BR. '+
      'You MUST search the web, not your memory. Return ONLY JSON: '+
      '{"items":[{"id":"listed-id","sourceUrl":"https://...","locale":"pt-BR","highlights":["atividade específica 1","atividade específica 2"],'+
      '"animals":["espécie confirmada"],"why":"motivo curto para visitar",'+
      '"admission":{"adultCAD":null,"childCAD":null,"free":false,"evidence":""}}]}. '+
      'Venues: '+JSON.stringify(group.map(x=>({id:x.id,name:x.name,category:x.category})));
    try{
      const data=await getJSON('https://api.openai.com/v1/responses',{
        method:'POST',timeoutMs:33000,
        headers:{'content-type':'application/json',authorization:'Bearer '+env.OPENAI_API_KEY},
        body:JSON.stringify({model:'gpt-6-luna',reasoning:{effort:'low'},
          tools:[{type:'web_search',search_context_size:'medium',user_location:{type:'approximate',city:'Ottawa',region:'Ontario',country:'CA',timezone:'America/Toronto'}}],
          tool_choice:'required',include:['web_search_call.action.sources'],
          input:prompt,store:false,max_output_tokens:1700})
      });
      const cited=sources(data),raw=parse(data);
      const accepted=new Set(group.map(x=>x.id));
      for(const row of Array.isArray(raw.items)?raw.items:[]){
        if(!accepted.has(row?.id)||results.has(row.id))continue;
        const item=sanitizeEnrichment(row,cited);
        if(!item)continue;
        results.set(row.id,item);
        try{await env.ACTIVITIES_KV.put(PREFIX+row.id,JSON.stringify(item),{expirationTtl:TTL});}catch{}
      }
      // Negative cache for seven days prevents repeated paid searches when
      // an attraction has no independently verifiable official information.
      for(const p of group)if(!results.has(p.id)){
        const marker={unavailable:true,checkedAt:new Date().toISOString()};
        results.set(p.id,marker);
        try{await env.ACTIVITIES_KV.put(PREFIX+p.id,JSON.stringify(marker),{expirationTtl:7*86400});}catch{}
      }
    }catch{ /* Do not discard valid activities if the independent search fails. */ }
  }));
  return results;
}
export function priceDisplay(info,adults=2,kids=0){
  if(!info?.admission)return {label:'Admission unverified',perPerson:null};
  const a=info.admission;
  if(a.type==='free')return {label:'Free admission (published)',perPerson:0};
  if(a.type!=='priced'||a.adultCAD===null||a.childCAD===null)return {label:'Admission unverified',perPerson:null};
  const total=adults*a.adultCAD+kids*a.childCAD,people=adults+kids;
  return {label:'≈ C$'+(total/people).toFixed(2)+'/person (admission)',perPerson:Math.round(total/people*100)/100,
    adultCAD:a.adultCAD,childCAD:a.childCAD,estimatedTotal:Math.round(total*100)/100};
}
export function factsDisplay(record,adults=2,kids=0){
  const info=validStored(record)?record:null;
  return {highlights:info?.highlights||[],animals:info?.animals||[],
    why:info?.why||'',factsLocale:info?.locale||'',sourceUrl:info?.sourceUrl||'',checkedAt:info?.checkedAt||'',
    price:priceDisplay(info,adults,kids)};
}
