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
test('Couple has twelve romantic activities, and Family/Visits remain separate',()=>{
 const ideas=catalogue();
 const couple=ideas.generate({kids:false,mode:'couple'});
 assert.equal(couple.length,12);
 assert.equal(new Set(couple.map(x=>x.id)).size,12);
 assert(couple.some(x=>x.name.includes('Dança lenta')));
 assert(couple.some(x=>x.name.includes('Fondue')));
 assert(couple.some(x=>x.name.includes('Jantar à meia-luz')));
 assert(couple.some(x=>x.name.includes('primeiro encontro')));
 assert(!couple.some(x=>x.name.includes('Jogos de cartas')));
 assert(couple.every(x=>x.audience==='couple'));
 const coupleDespiteStaleKids=ideas.generate({kids:true,mode:'couple'});
 assert.deepEqual(coupleDespiteStaleKids.map(x=>x.id),couple.map(x=>x.id),
   'Couple must never revert to children activities');
 const grown=ideas.generate({kids:false,mode:'family'});
 assert.equal(grown.length,8);
 assert(grown.some(x=>x.name.includes('mocktails')));
 const guests=ideas.generate({kids:true,mode:'visits'});
 assert.equal(guests.length,8);
 assert(guests.some(x=>x.name.includes('boas-vindas')));
 const adultGuests=ideas.generate({kids:false,mode:'visits'});
 assert.equal(adultGuests.length,8);
 assert(adultGuests[0].name.includes('Jantar de boas-vindas'));
 const second=ideas.generate({kids:true,mode:'family',rotation:1});
 const first=ideas.generate({kids:true,mode:'family',rotation:0});
 assert.equal(second[0].id,first[1].id);
 assert.equal(second.length,12);
});
test('At Home videos are allowlisted verified YouTube IDs, no arbitrary source iframe',()=>{
 const ideas=catalogue();
 const family=ideas.generate({kids:true});
 assert.equal(family.find(x=>x.id==='home:science').videoId,'ZmY1O9eWt-Y');
 assert.equal(family.find(x=>x.id==='home:shadow').videoId,'TFBRCPoyeqI');
 assert(family.every(x=>!x.videoId||/^[A-Za-z0-9_-]{11}$/.test(x.videoId)));
 assert(ideas.generate({kids:false,mode:'couple'}).every(x=>!x.videoId));
});
