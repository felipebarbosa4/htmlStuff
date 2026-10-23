import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeWav,isLikelyFireKiosk} from '../family-dashboard/fire-voice.mjs';
import {allowedAudioRequest,onRequestPost} from '../functions/api/voice/transcribe.js';
import {readFileSync} from 'node:fs';
const host='https://family-smart-dashboard.pages.dev/api/voice/transcribe';
const csrf={'origin':'https://family-smart-dashboard.pages.dev','sec-fetch-site':'same-origin'};
function makeWav(){return encodeWav(Float32Array.from({length:16000},(_,i)=>Math.sin(i/4)*.2),16000);}
function request(blob=makeWav(),origin=csrf.origin){
 const form=new FormData();form.append('audio',blob,'speech.wav');
 return new Request(host,{method:'POST',headers:{...csrf,origin},body:form});
}
test('Fire detection and PCM WAV works without Google speech engine',async()=>{
 assert.equal(isLikelyFireKiosk('Mozilla/5.0 (Linux; Android 9; KFKAWI Build/PS7321; wv)'),true);
 assert.equal(isLikelyFireKiosk('Mozilla/5.0 Silk/120 Amazon Fire OS'),true);
 assert.equal(isLikelyFireKiosk('Chrome/120.0.1 Android'),false);
 const wav=makeWav();
 const bytes=new Uint8Array(await wav.arrayBuffer());
 assert.equal(wav.type,'audio/wav');
 assert.equal(wav.size,32044);
 assert.equal(String.fromCharCode(...bytes.slice(0,4)),'RIFF');
 assert.equal(String.fromCharCode(...bytes.slice(8,12)),'WAVE');
 assert.equal(new DataView(bytes.buffer).getUint32(24,true),16000);
});
test('audio endpoint rejects cross-site origin and missing server config',async()=>{
 assert.equal(allowedAudioRequest(request()),true);
 assert.equal((await onRequestPost({request:request(makeWav(),'https://example.com'),env:{}})).status,403);
 assert.equal((await onRequestPost({request:request(),env:{OPENAI_API_KEY:'test'}})).status,503);
});
test('audio endpoint rejects invalid WAV and files that are too small',async()=>{
 const mockKV={get:async()=>null,put:async()=>{}};
 const env={OPENAI_API_KEY:'test',ACTIVITIES_KV:mockKV};
 assert.equal((await onRequestPost({request:request(new Blob(['too-short'],{type:'audio/wav'})),env})).status,400);
 const invalid=new Blob([new Uint8Array(6000)],{type:'audio/wav'});
 assert.equal((await onRequestPost({request:request(invalid),env})).status,400);
});
test('audio endpoint transcribes only user-submitted WAV with provider key kept server-side',async()=>{
 let capture=null,puts=0;
 const mockKV={get:async()=>null,put:async()=>{puts++;}};
 const previous=globalThis.fetch;
 globalThis.fetch=async (url,options)=>{
  capture={url,options};
  return new Response(JSON.stringify({text:'Ei família, abra o calendário'}),{status:200});
 };
 try{
  const res=await onRequestPost({request:request(),env:{OPENAI_API_KEY:'secret',ACTIVITIES_KV:mockKV}});
  assert.equal(res.status,200);
  assert.deepEqual(await res.json(),{text:'Ei família, abra o calendário'});
  assert.equal(capture.url,'https://api.openai.com/v1/audio/transcriptions');
  assert.equal(capture.options.headers.Authorization,'Bearer secret');
  assert.equal(capture.options.body.get('model'),'gpt-transcribe');
  assert.equal(capture.options.body.get('languages[]'),'pt');
  assert.equal(capture.options.body.get('file').name,'speech.wav');
  assert.equal(puts,2);
 }finally{globalThis.fetch=previous;}
});
test('audio cloud use has quota guards',async()=>{
 const mockKV={get:async()=>200,put:async()=>{}};
 const r=await onRequestPost({request:request(),env:{OPENAI_API_KEY:'test',ACTIVITIES_KV:mockKV}});
 assert.equal(r.status,429);
});
test('voice overlay points to fallback and keeps privacy controls',()=>{
 const html=readFileSync(new URL('../family-dashboard/index.html',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../family-dashboard/voice.mjs',import.meta.url),'utf8');
 const server=readFileSync(new URL('../functions/api/voice/transcribe.js',import.meta.url),'utf8');
 assert.match(html,/fire-fallback-v2/);
 assert.match(ui,/createFireAudio/);
 assert.match(ui,/channel==='cloud'/);
 assert.match(ui,/fireAudio\?\.stop\(\)/);
 assert.match(server,/env\.ACTIVITIES_KV/);
 assert.match(server,/limite diário|Limite diário/);
});
