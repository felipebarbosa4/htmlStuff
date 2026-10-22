import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

function catalogue(){
 const context={window:{}};
 runInNewContext(readFileSync(new URL('../family-dashboard/home.js',import.meta.url),'utf8'),context);
 return context.window.HomeIdeas;
}
test('At Home has twelve curated family activities with documented, actionable instructions',()=>{
 const data=catalogue().generate({kids:true,mode:'family'});
 assert.equal(data.length,12);
 assert.equal(new Set(data.map(x=>x.id)).size,12);
 assert(data.some(x=>x.name.includes('jogos de tabuleiro')));
 assert(data.some(x=>x.name.includes('sem álcool')));
 assert(data.some(x=>x.name.includes('Halloween')));
 for(const x of data){
  assert.equal(x.kind,'home');
  assert.equal(x.steps.length,3);
  assert(x.steps.every(step=>step.length>12));
  assert(x.duration>=20&&x.duration<=120);
  assert(/^https:\/\//.test(x.sourceUrl));
  assert(x.icon.length>0&&x.bring.length>4&&x.why.length>5);
 }
});
test('At Home switches to adult ideas and rotates without generating or contacting an AI',()=>{
 const ideas=catalogue();const adult=ideas.generate({kids:false,mode:'couple'});
 assert.equal(adult.length,8);
 assert(adult.some(x=>x.name.includes('degustação')));
 assert(!adult.some(x=>x.name.includes('Halloween')));
 const second=ideas.generate({kids:true,mode:'family',rotation:1});
 const first=ideas.generate({kids:true,mode:'family',rotation:0});
 assert.equal(second[0].id,first[1].id);
 assert.equal(second.length,12);
});
