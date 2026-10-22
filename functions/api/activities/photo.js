import {json,getJSON} from './shared.js';
import {keyFor,normalizeOptions} from './config.js';
// Resolve live photo resources each time; do not cache Google's expiring photo names or URLs.
export async function onRequestGet({request,env}) {
  if(!env.ACTIVITIES_KV||!env.GOOGLE_MAPS_API_KEY)return json({error:'Photo service not configured'},503);
  const u=new URL(request.url);
  const id=u.searchParams.get('placeId');
  const mode=normalizeOptions({mode:u.searchParams.get('mode')}).mode;
  if(!id||id.length>200||!/^[A-Za-z0-9_:-]+$/.test(id))return json({error:'Invalid place ID'},400);
  try{
    const saved=await env.ACTIVITIES_KV.get(keyFor(mode),'json');
    if(!saved?.items?.some(x=>x.id===id))return json({error:'Place is not in your saved recommendations'},404);
    const data=await getJSON('https://places.googleapis.com/v1/places/'+encodeURIComponent(id),{
      headers:{'X-Goog-Api-Key':env.GOOGLE_MAPS_API_KEY,'X-Goog-FieldMask':'photos,attributions'}
    });
    const photo=data.photos?.[0];
    if(!photo?.name)return json({error:'This place has no available photo'},404);
    const media=await getJSON('https://places.googleapis.com/v1/'+photo.name+'/media?maxWidthPx=720&skipHttpRedirect=true',{
      headers:{'X-Goog-Api-Key':env.GOOGLE_MAPS_API_KEY}
    });
    if(!/^https:\/\//.test(media.photoUri||''))return json({error:'Invalid photo media URL'},502);
    const credits=(photo.authorAttributions||[]).map(x=>({name:String(x.displayName||'Photographer').slice(0,80),
      uri:/^https:\/\//.test(x.uri||'')?x.uri:''})).slice(0,4);
    return json({url:media.photoUri,credits,sourceUrl:/^https:\/\//.test(photo.googleMapsUri||'')?photo.googleMapsUri:''});
  }catch{return json({error:'Photo temporarily unavailable'},502);}
}