import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestPost} from '../functions/api/voice/speak.js';
const base='https://family-smart-dashboard.pages.dev/api/voice/speak';
const good={origin:'https://family-smart-dashboard.pages.dev','sec-fetch-site':'same-origin','content-type':'application/json'};
const kv={get:async()=>null,put:async()=>{}};
const req=(data,headers={})=>new Request(base,{method:'POST',headers:{...good,...headers},body:JSON.stringify(data)});
test('TTS endpoint denies cross-site access and missing bindings',async()=>{
 assert.equal((await onRequestPost({request:req({text:'Olá'},{origin:'https://other.example'}),env:{}})).status,403);
 assert.equal((await onRequestPost({request:req({text:'Olá'}),env:{}})).status,503);
});
test('TTS endpoint does not expose provider key or return content over limit',async()=>{
 assert.equal((await onRequestPost({request:req({text:'a'.repeat(900)}),env:{OPENAI_API_KEY:'test',ACTIVITIES_KV:kv}})).status,400);
});
test('TTS endpoint builds valid mp3 request in Brazilian Portuguese',async()=>{
 const original=globalThis.fetch;
 let reqDetails;
 globalThis.fetch=async (url,opts)=>{
  reqDetails={url,opts};
  return new Response(new Uint8Array(2000),{status:200});
 };
 try{
  const result=await onRequestPost({request:req({text:'Oi, tudo bem com você?'}),env:{OPENAI_API_KEY:'server-secret',ACTIVITIES_KV:kv}});
  assert.equal(result.status,200);
  assert.equal(result.headers.get('content-type'),'audio/mpeg');
  assert.equal((await result.arrayBuffer()).byteLength,2000);
  assert.equal(reqDetails.url,'https://api.openai.com/v1/audio/speech');
  const payload=JSON.parse(reqDetails.opts.body);
  assert.equal(payload.model,'gpt-4o-mini-tts');
  assert.equal(payload.input,'Oi, tudo bem com você?');
  assert.equal(payload.response_format,'mp3');
  assert.match(payload.instructions,/português brasileiro/);
  assert.equal(reqDetails.opts.headers.authorization,'Bearer server-secret');
 }finally{globalThis.fetch=original;}
});
