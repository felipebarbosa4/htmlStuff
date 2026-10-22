import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../family-dashboard/index.html',import.meta.url),'utf8');
const from=html.indexOf('const LUNCH_START=690');
const to=html.indexOf('function setUI(mode)',from);
assert.ok(from>0&&to>from,'Lunch priority code must be present in dashboard');
const ctx=vm.createContext({
 TZ:'America/Toronto',Intl,Date,
 window:{WastePanel:{slot:()=>null}},
 ottawaDate:()=> '2026-10-22'
});
vm.runInContext(html.slice(from,to),ctx);
const check=(events)=>vm.runInContext('lunchConflicts('+JSON.stringify(events)+',"2026-10-22")',ctx);
const appointment=(start,end)=>({allDay:false,start:'2026-10-22T'+start+'-04:00',end:'2026-10-22T'+end+'-04:00'});

test('lunch spans 11:30 through 12:59 and returns to calendar at 13:00',()=>{
 vm.runInContext('lunchCalendar.date="2026-10-22";lunchCalendar.verifiedAt=Date.now();lunchCalendar.hasConflict=false;',ctx);
 for(const [hour,minute,expected] of [[11,29,'calendar'],[11,30,'meals'],[12,0,'meals'],[12,59,'meals'],[13,0,'calendar']])
  assert.equal(ctx.which({hour,minute}),expected, 'at '+hour+':'+minute);
 vm.runInContext('lunchCalendar.hasConflict=true',ctx);
 assert.equal(ctx.which({hour:12,minute:35}),'calendar');
 vm.runInContext('lunchCalendar.verifiedAt=0;lunchCalendar.hasConflict=false',ctx);
 assert.equal(ctx.which({hour:12,minute:35}),'calendar','unverified calendar must take precedence');
});
test('a meeting starting exactly at 13:00 blocks lunch',()=>{
 assert.equal(check([appointment('13:00:00','14:00:00')]),true);
 assert.equal(check([appointment('12:30:00','13:00:00')]),true);
 assert.equal(check([appointment('11:15:00','11:45:00')]),true);
 assert.equal(check([appointment('13:01:00','14:00:00')]),false);
 assert.equal(check([appointment('11:00:00','11:30:00')]),false);
});
test('all-day events do not hide lunch, calendar events use Ottawa time',()=>{
 assert.equal(check([{allDay:true,start:'2026-10-22',end:'2026-10-23'}]),false);
 assert.equal(check([{start:'2026-10-22T16:30:00Z',end:'2026-10-22T17:00:00Z'}]),true);
 assert.equal(check([]),false);
});
test('calendar verification starts before lunch and does not persist private data',()=>{
 assert.match(html,/minute<675 \|\| minute>=LUNCH_END/);
 assert.match(html,/data\.partial/);
 assert.match(html,/credentials:'same-origin',cache:'no-store',redirect:'manual'/);
 assert.doesNotMatch(html,/localStorage\.setItem\(['"]lunch/);
});
