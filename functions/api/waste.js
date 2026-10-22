import { parseWasteIcs } from '../_waste.js';

const CALENDAR_URL = 'https://ottawa.ca/en/garbage-and-recycling/recycling/your-garbage-and-recycling-collection-calendar';
const VALID_ICS = /^https:\/\/(?:recollect\.a\.ssl\.fastly\.net|api\.recollect\.net|recollect-us\.global\.ssl\.fastly\.net)\/api\/places\/[A-F0-9-]+\/services\/\d+\/events\.[\w-]+\.ics(?:\?.*)?$/i;
const CORS = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=300, must-revalidate','X-Content-Type-Options':'nosniff'};
function reply(body,status=200) {return new Response(JSON.stringify(body),{status,headers:CORS});}

export async function onRequestGet({env,request}) {
  const source = env.WASTE_ICS_URL;
  if (!source || !VALID_ICS.test(source)) return reply({error:'Calendário de coleta não configurado.',sourceUrl:CALENDAR_URL},503);
  const cacheKey = new Request(new URL('/api/waste/__internal_cache_v1',request.url).toString());
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const previous = cache ? await cache.match(cacheKey) : null;
  if (previous) return previous;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(),9000);
    let res;
    try {res = await fetch(source,{signal:controller.signal,headers:{Accept:'text/calendar'},cf:{cacheTtl:0}});}
    finally {clearTimeout(timeout);}
    if (!res.ok) throw new Error('Calendar feed HTTP '+res.status);
    const raw=await res.text();
    if (raw.length > 200000) throw new Error('Calendar feed exceeds limit');
    const events=parseWasteIcs(raw);
    if (!events.length) throw new Error('No valid events');
    const result=reply({events,checkedAt:new Date().toISOString(),source:'ReCollect / Ottawa',sourceUrl:CALENDAR_URL});
    if (cache) await cache.put(cacheKey,result.clone());
    return result;
  } catch {
    return reply({error:'Não foi possível atualizar o calendário oficial.',sourceUrl:CALENDAR_URL},503);
  }
}
