import test from 'node:test';
import assert from 'node:assert/strict';
import {cookieFor} from '../functions/_finance.js';
import {onRequestGet} from '../functions/api/finance/notion.js';

const ORIGIN='https://finance.example.org';
const snapshot={
 source:'notion-snapshot',fetchedAt:'2026-10-21T22:00:00.000Z',
 statementBalances:[{name:'Test chequing',amount:100,date:'2026-10-01',kind:'credit'}],
 reviews:{unclassifiedETransfers:2},items:[
  {id:'synthetic-expense',kind:'expense',amount:21,date:'2026-10-01',title:'Test purchase'},
  {id:'synthetic-transfer',kind:'transfer',amount:12,date:'2026-10-02',title:'Test transfer'}
 ]};
class KV{
 async get(key,type){assert.equal(key,'finance:notion:snapshot:v1');assert.equal(type,'json');return snapshot;}
}
const env={FINANCE_PIN:'000000',FINANCE_SESSION_SECRET:'finance-notion-test-'.repeat(3),FINANCE_KV:new KV()};
const req=cookie=>new Request(ORIGIN+'/api/finance/notion',{headers:{...(cookie?{cookie}:{})}});
test('Finance Notion import is denied before PIN login',async()=>{
 const res=await onRequestGet({request:req(),env});
 assert.equal(res.status,401);
 assert.equal(res.headers.get('cache-control'),'private, no-store, max-age=0');
});
test('Finance Notion import uses signed viewer session',async()=>{
 const cookie=(await cookieFor(env,'view',120)).split(';')[0];
 const res=await onRequestGet({request:req(cookie),env});
 assert.equal(res.status,200);
 const body=await res.json();
 assert.equal(body.items.length,2);
 assert.equal(body.count,2);
 assert.equal(body.items[0].kind,'expense');
 assert.equal(body.items[1].kind,'transfer');
 assert.equal(body.statementBalances[0].amount,100);
});
test('Notion history fails closed when backend is missing',async()=>{
 const res=await onRequestGet({request:req(),env:{}});
 assert.equal(res.status,503);
});
