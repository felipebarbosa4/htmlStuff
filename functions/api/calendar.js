// Cloudflare Pages Function — read-only daily agenda.
// Store GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN as
// encrypted production secrets in Cloudflare. Never commit their values.
// The production hostname must be protected by Cloudflare Access.
const ZONE = 'America/Toronto';
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const dayFmt = new Intl.DateTimeFormat('en-CA', {timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit'});
function dateInOttawa(d) {
  const x = Object.fromEntries(dayFmt.formatToParts(d).filter(p => p.type !== 'literal').map(p => [p.type,p.value]));
  return x.year + '-' + x.month + '-' + x.day;
}
const headers = {
  'content-type':'application/json; charset=utf-8',
  'cache-control':'private, no-store, max-age=0',
  'pragma':'no-cache',
  'x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer',
};
const reply = (body, status = 200) => new Response(JSON.stringify(body), {status, headers});
async function googleJson(url, accessToken) {
  const resp = await fetch(url, {
    headers: {Authorization: 'Bearer ' + accessToken, Accept: 'application/json'},
    cf: {cacheTtl: 0, cacheEverything: false}
  });
  if (!resp.ok) throw new Error('Google Calendar returned ' + resp.status);
  return resp.json();
}
async function pages(url, token, maxPages = 15) {
  let items = [], pageToken, page = 0;
  do {
    const u = new URL(url);
    if (pageToken) u.searchParams.set('pageToken', pageToken);
    const data = await googleJson(u.toString(), token);
    items.push(...(data.items || []));
    pageToken = data.nextPageToken;
    page++;
  } while (pageToken && page < maxPages);
  if (pageToken) throw new Error('Calendar results exceed the pagination safety limit');
  return items;
}
function overlapsLocalDate(e, wanted) {
  if (!e.start || !e.end) return false;
  if (e.start.date) return e.start.date <= wanted && e.end.date > wanted;
  const start = new Date(e.start.dateTime), end = new Date(e.end.dateTime);
  if (!Number.isFinite(start.valueOf()) || !Number.isFinite(end.valueOf())) return false;
  // Include appointments that started the prior day but still run on this day.
  const endBeforeExclusive = new Date(end.getTime() - 1);
  return dateInOttawa(start) <= wanted && dateInOttawa(endBeforeExclusive) >= wanted;
}
export async function onRequestGet(context) {
  const {GOOGLE_CLIENT_ID:clientId, GOOGLE_CLIENT_SECRET:clientSecret, GOOGLE_REFRESH_TOKEN:refreshToken} = context.env;
  if (!clientId || !clientSecret || !refreshToken) {
    return reply({error:'Google Calendar authorization has not been configured yet.'},503);
  }
  const requestUrl = new URL(context.request.url);
  const selectedDate = requestUrl.searchParams.get('date') || dateInOttawa(new Date());
  if (!datePattern.test(selectedDate) || !Number.isFinite(Date.parse(selectedDate+'T00:00:00Z'))) {
    return reply({error:'Invalid date'},400);
  }
  // Wider than one Ottawa day to handle standard/daylight saving offset,
  // overnight meetings, and multi-day all-day events.
  const d = Date.parse(selectedDate + 'T00:00:00Z');
  if (Math.abs(d-Date.now()) > 40 * 86400000) return reply({error:'Requested date is outside allowed range'},400);
  const min = new Date(d-36*3600000).toISOString();
  const max = new Date(d+60*3600000).toISOString();
  try {
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({client_id:clientId, client_secret:clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'})
    });
    if (!tokenResp.ok) throw new Error('Google authorization expired or was revoked (HTTP '+tokenResp.status+')');
    const token = await tokenResp.json();
    if (!token.access_token) throw new Error('Google returned no access token');

    const calendars = await pages('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250&showHidden=true',token.access_token);
    const available = calendars.filter(c => c.accessRole && c.accessRole !== 'none');
    const results = await Promise.all(available.map(async cal => {
      try {
        const url = 'https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(cal.id)+'/events?'+new URLSearchParams({
          timeMin:min,timeMax:max,maxResults:'2500',singleEvents:'true',orderBy:'startTime',showDeleted:'false'
        });
        const events = await pages(url,token.access_token,8);
        return {calendar:cal,events:events.filter(e => e.status!=='cancelled' && overlapsLocalDate(e,selectedDate))};
      } catch (e) {return {calendar:cal,error:e.message,events:[]};}
    }));
    const all = [];
    for (const r of results) {
      for (const e of r.events) {
        // Read-only display fields only; descriptions, attendee emails and
        // private conference URLs are intentionally not returned.
        const allDay = Boolean(e.start?.date);
        all.push({
          id: String(e.id || ''),
          title: String(e.summary || (e.visibility === 'private' ? 'Private event' : 'Busy')),
          calendar: String(r.calendar.summary || 'Calendar'),
          color: /^#[0-9a-fA-F]{6}$/.test(r.calendar.backgroundColor || '') ? r.calendar.backgroundColor : '#67decf',
          allDay,
          start: allDay ? e.start.date : e.start?.dateTime,
          end: allDay ? e.end.date : e.end?.dateTime,
          location: typeof e.location === 'string' ? e.location.slice(0,200) : '',
        });
      }
    }
    all.sort((a,b)=>Number(b.allDay)-Number(a.allDay) || String(a.start).localeCompare(String(b.start)) || a.title.localeCompare(b.title));
    // Search the next 30 days for timed appointments (not just today's events).
    // Keeping several future events per calendar lets the kiosk advance NEXT UP
    // locally, even if an appointment starts before the next 10-minute refresh.
    const now=Date.now(), horizon=new Date(now+30*86400000).toISOString();
    const upcomingResults=await Promise.all(available.map(async cal=>{
      try{
        const url='https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(cal.id)+'/events?'+new URLSearchParams({
          timeMin:new Date(now).toISOString(),timeMax:horizon,maxResults:'2500',
          singleEvents:'true',orderBy:'startTime',showDeleted:'false'
        });
        const events=await pages(url,token.access_token,2);
        return {events:events.filter(e=>e.status!=='cancelled' && e.start?.dateTime && Date.parse(e.start.dateTime)>now)
          .slice(0,12).map(e=>({
            id:String(e.id||''),title:String(e.summary||(e.visibility==='private'?'Private event':'Busy')),
            calendar:String(cal.summary||'Calendar'),
            color:/^#[0-9a-fA-F]{6}$/.test(cal.backgroundColor||'')?cal.backgroundColor:'#67decf',
            allDay:false,start:e.start.dateTime,end:e.end?.dateTime||'',
            location:typeof e.location==='string'?e.location.slice(0,200):''
          }))};
      }catch(e){return {error:true,events:[]};}
    }));
    const upcomingEvents=upcomingResults.flatMap(x=>x.events)
      .sort((a,b)=>Date.parse(a.start)-Date.parse(b.start)).slice(0,40);
    const failures=results.filter(x=>x.error).length;
    const upcomingPartial=upcomingResults.some(x=>x.error);
    return reply({date:selectedDate,timezone:ZONE,calendarCount:available.length,
      eventCount:all.length,partial:failures>0,failedCalendars:failures,
      upcomingPartial,upcomingEvents,events:all});
  } catch(e) {
    return reply({error:'Unable to retrieve Google Calendar events. Check the Google authorization and Cloudflare secrets.'},502);
  }
}