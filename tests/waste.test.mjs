import test from 'node:test';
import assert from 'node:assert/strict';
import {parseWasteIcs} from '../functions/_waste.js';
import {onRequestGet} from '../functions/api/waste.js';

const sample=[
 'BEGIN:VCALENDAR','X-WR-CALNAME:Private address',
 'BEGIN:VEVENT','DTSTART;VALUE=DATE:20261022',
 'SUMMARY:Black bin\\, green bin\\, and yard trimmings','END:VEVENT',
 'BEGIN:VEVENT','DTSTART;VALUE=DATE:20261029',
 'SUMMARY:Garbage\\, blue bin\\, green bin\\, and yard trimmings','END:VEVENT',
 'END:VCALENDAR'
].join('\r\n');
test('Ottawa schedules parse all collection categories with escaped commas',()=>{
 assert.deepEqual(parseWasteIcs(sample),[
 {date:'2026-10-22',types:['black','green','yard']},
 {date:'2026-10-29',types:['garbage','blue','green','yard']}
 ]);
});
test('folded ICS lines and unrelated events are handled',()=>{
 const ics='BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART;VALUE=DATE:20261105\nSUMMARY:Black bin\\, green bin\\, and yard\n trimmings\nEND:VEVENT\nBEGIN:VEVENT\nDTSTART;VALUE=DATE:20261104\nSUMMARY:Meeting\nEND:VEVENT\nEND:VCALENDAR';
 assert.deepEqual(parseWasteIcs(ics),[{date:'2026-11-05',types:['black','green','yard']}]);
});
test('invalid calendar never generates invented dates',()=>assert.throws(()=>parseWasteIcs('junk')));
test('API exposes only dates and categories, never the address',async()=>{
 const old=globalThis.fetch;
 globalThis.fetch=async()=>new Response(sample,{status:200});
 try {
  const response=await onRequestGet({env:{WASTE_ICS_URL:'https://recollect.a.ssl.fastly.net/api/places/AAA-111/services/208/events.en.ics'},request:new Request('https://example.com/api/waste')});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.events.length,2);
  assert.ok(!JSON.stringify(body).includes('Private address'));
  assert.ok(!JSON.stringify(body).includes('AAA-111'));
 }finally{globalThis.fetch=old;}
});
test('API refuses missing URL and fails closed on fetch error',async()=>{
 const missing=await onRequestGet({env:{},request:new Request('https://example.com/api/waste')});
 assert.equal(missing.status,503);
 const old=globalThis.fetch;
 globalThis.fetch=async()=>new Response('bad',{status:500});
 try{const fail=await onRequestGet({env:{WASTE_ICS_URL:'https://recollect.a.ssl.fastly.net/api/places/AAA-111/services/208/events.en.ics'},request:new Request('https://example.com/api/waste')});assert.equal(fail.status,503);}
 finally{globalThis.fetch=old;}
});
