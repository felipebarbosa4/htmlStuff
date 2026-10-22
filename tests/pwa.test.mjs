import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
const root=new URL('../family-dashboard/',import.meta.url);
const get=name=>readFileSync(new URL(name,root),'utf8');
const html=get('index.html');
const manifest=JSON.parse(get('manifest.webmanifest'));
test('installable Android manifest uses the dashboard path and fullscreen',()=>{
 assert.equal(manifest.id,'/family-dashboard/');
 assert.equal(manifest.start_url,'/family-dashboard/');
 assert.equal(manifest.scope,'/family-dashboard/');
 assert.equal(manifest.display,'fullscreen');
 assert.equal(manifest.theme_color,'#0a1426');
 assert.ok(manifest.icons.some(i=>i.sizes==='192x192'&&i.type==='image/png'));
 assert.ok(manifest.icons.some(i=>i.sizes==='512x512'&&i.type==='image/png'));
 for(const icon of manifest.icons){
  const data=readFileSync(new URL(icon.src.replace('/family-dashboard/',''),root));
  assert.equal(data.subarray(1,4).toString(),'PNG');
  assert.ok(data.length>1000);
 }
});
test('correct viewport, manifest, and icon are linked',()=>{
 assert.match(html,/viewport-fit=cover/);
 assert.match(html,/rel="manifest" href="\/family-dashboard\/manifest.webmanifest"/);
 assert.match(html,/rel="icon" sizes="192x192"/);
 assert.match(html,/serviceWorker\.register\('\/family-dashboard\/sw\.js'/);
});
test('service worker does not intercept API requests or cache private entries',()=>{
 const sw=get('sw.js');
 assert.match(sw,/request\.mode==='navigate'/);
 assert.match(sw,/fetch\(event\.request\)/);
 assert.doesNotMatch(sw,/(?:caches\.open|caches\.put)/);
});
test('main screen avoids fixed 100vh iframe and enables dynamic viewport',()=>{
 assert.match(html,/height:100dvh/);
 assert.match(html,/#stage\{display:flex;flex-direction:column;min-height:0/);
 assert.match(html,/#frame\{display:block;flex:1 1 auto/);
 assert.match(html,/overflow:hidden/);
});
test('automatic slots and 15s refresh are unchanged',()=>{
 assert.match(html,/min>=690&&min<720\)return 'meals'/);
 assert.match(html,/min>=480&&min<530\)return 'weather'/);
 assert.match(html,/setInterval\(render,15000\);render\(\)/);
});
test('calendar avoids losing overflowed events through pagination',()=>{
 assert.match(html,/const totalPages=Math\.max\(1,Math\.ceil\(events\.length\/pageSize\)\)/);
 assert.match(html,/events\.slice\(calendarPage\*pageSize,\(calendarPage\+1\)\*pageSize\)/);
});
