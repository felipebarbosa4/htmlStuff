import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {extractWakePhrase,localIntent,nextAgenda} from '../family-dashboard/voice-core.mjs';
import {onRequestPost,allowedVoiceOrigin} from '../functions/api/voice.js';

const root=new URL('../family-dashboard/',import.meta.url);
const html=readFileSync(new URL('index.html',root),'utf8');
const voice=readFileSync(new URL('voice.mjs',root),'utf8');
const css=readFileSync(new URL('voice.css',root),'utf8');

test('wake phrase only triggers at the start, supporting Brazilian Portuguese variants',()=>{
 assert.equal(extractWakePhrase('Hey Family, qual é a data de hoje?'),'qual é a data de hoje?');
 assert.equal(extractWakePhrase('Ei família, abre o calendário'),'abre o calendário');
 assert.equal(extractWakePhrase('oi família'),'');
 assert.equal(extractWakePhrase('Hoje a família vai passear'),null);
 assert.equal(extractWakePhrase('barulho e conversa normal'),null);
});
test('local commands navigate only allowlisted screens',()=>{
 assert.deepEqual(localIntent('Abra o calendário'),{type:'screen',screen:'calendar'});
 assert.deepEqual(localIntent('Quero ver as refeições'),{type:'screen',screen:'meals'});
 assert.deepEqual(localIntent('Mostre a coleta de lixo'),{type:'screen',screen:'waste'});
 assert.deepEqual(localIntent('Mostra o que fazer'),{type:'screen',screen:'activities'});
 assert.deepEqual(localIntent('Volte para modo automático'),{type:'screen',screen:'auto'});
 assert.deepEqual(localIntent('Qual é meu saldo?'),{type:'restricted'});
 assert.deepEqual(localIntent('Abre finance'),{type:'restricted'});
 assert.deepEqual(localIntent('Qual é a hora agora?'),{type:'clock',date:false});
 assert.deepEqual(localIntent('Que horas são?'),{type:'clock',date:false});
 assert.deepEqual(localIntent('Qual o próximo compromisso?'),{type:'agenda'});
});
test('agenda helper filters all-day, invalid, and past entries',()=>{
 const now=Date.parse('2026-10-23T12:00:00Z');
 const items=nextAgenda([
  {title:'School',start:'2026-10-23T15:00:00Z'},
  {title:'Old',start:'2026-10-22T15:00:00Z'},
  {title:'Birthday',start:'2026-10-24T00:00:00Z',allDay:true},
  {title:'Soon',start:'2026-10-23T13:00:00Z'}
 ],now);
 assert.deepEqual(items.map(x=>x.title),['Soon','School']);
});
test('voice module integrates without changing dashboard auto scheduling or PWA cache policy',()=>{
 assert.match(html,/voice\.css\?v=voice-v1/);
 assert.match(html,/type="module" src="\/family-dashboard\/voice\.mjs\?v=voice-v1"/);
 assert.match(html,/window\.familyDashboardVoice=Object\.freeze/);
 assert.match(html,/\['auto','weather','calendar','night','activities','waste','meals'\]/);
 assert.match(html,/setInterval\(render,15000\);render\(\)/);
 assert.match(html,/min>=690&&min<780\)return lunchIsVerifiedFree\(\)\?'meals':'calendar'/);
 assert.doesNotMatch(html,/familyDashboardVoice[\s\S]{0,130}finance/);
 assert.match(voice,/window\.SpeechRecognition\|\|window\.webkitSpeechRecognition/);
 assert.match(voice,/rec\.lang='pt-BR'/);
 assert.match(voice,/new SpeechSynthesisUtterance/);
 assert.match(voice,/document\.hidden/);
 assert.match(voice,/addEventListener\('click'/);
 assert.match(css,/position:fixed/);
 assert.match(css,/pointer-events:none/);
 assert.doesNotMatch(css,/(?:height:100vh|overflow-y:auto)/);
});
function request(body,options={}){
 return new Request('https://family-smart-dashboard.pages.dev/api/voice',{
  method:'POST',headers:{'content-type':'application/json','origin':'https://family-smart-dashboard.pages.dev',
   'sec-fetch-site':'same-origin',...options.headers},body:JSON.stringify(body)
 });
}
test('voice server rejects external origin and requires configured provider',async()=>{
 assert.equal(allowedVoiceOrigin(request({question:'Oi'})),true);
 const external=request({question:'Oi'},{headers:{origin:'https://evil.example'}});
 assert.equal(allowedVoiceOrigin(external),false);
 assert.equal((await onRequestPost({request:external,env:{}})).status,403);
 assert.equal((await onRequestPost({request:request({question:'Oi'}),env:{}})).status,503);
});
test('voice endpoint sends only a short text to OpenAI and never stores the response',async()=>{
 const previous=globalThis.fetch;
 let call;
 globalThis.fetch=async (url,options)=>{
  call={url,options};return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:'Olá! Tudo bem?'}]}]}),{status:200});
 };
 try{
  const r=await onRequestPost({request:request({question:'Conte uma piada.'}),env:{OPENAI_API_KEY:'test-value'}});
  assert.equal(r.status,200);
  assert.equal((await r.json()).answer,'Olá! Tudo bem?');
  assert.equal(call.url,'https://api.openai.com/v1/responses');
  const payload=JSON.parse(call.options.body);
  assert.equal(payload.input,'Conte uma piada.');
  assert.equal(payload.store,false);
  assert.ok(payload.max_output_tokens<=250);
 }finally{globalThis.fetch=previous;}
});
test('voice endpoint rejects oversized requests before an AI request',async()=>{
 const r=await onRequestPost({request:request({question:'a'.repeat(281)}),env:{OPENAI_API_KEY:'test-value'}});
 assert.equal(r.status,400);
});
