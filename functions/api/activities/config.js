// First-party preferences, independent of Google Maps content.
export const MODES=['family','couple','visits'];
export const ENVIRONMENTS=['all','indoor','outdoor'];
export const BUDGETS=['free','under100','any'];
export const DISTANCE_CHOICES=[5,10,20,30,50];
export const CATEGORY_SETS={
  family:[
    ['park','family playground outdoor parks Ottawa Ontario'],
    ['indoor','kids indoor playground trampoline bowling Ottawa Ontario'],
    ['museum','science museums children family Ottawa Ontario'],
    ['recreation','swimming pools community recreation centres Ottawa Ontario'],
    ['library','Ottawa public library branches children Ottawa Ontario'],
    ['animals','farm animals family nature centre Ottawa Ontario'],
    ['cinema','movie theatres family films Ottawa Ontario']
  ],
  couple:[
    ['food','romantic coffee dessert dining date night Ottawa Ontario'],
    ['culture','art galleries live theatre jazz music Ottawa Ontario'],
    ['museum','interesting museums couples Ottawa Ontario'],
    ['indoor','escape rooms couples pottery workshop bowling Ottawa Ontario'],
    ['park','scenic sunset walk gardens waterfront Ottawa Ontario'],
    ['cinema','movie theatres couple date Ottawa Ontario'],
    ['recreation','couples dancing activities Ottawa Ontario']
  ],
  visits:[
    ['landmark','landmarks tourist attractions first time visitors Ottawa Ontario'],
    ['museum','top Ottawa museums Canadian history visitor attractions'],
    ['park','scenic Ottawa parks walking river view attractions'],
    ['culture','Ottawa cultural attractions galleries landmarks'],
    ['animals','Ottawa family animal farms attractions'],
    ['food','Ottawa restaurants with local Canadian food visitors'],
    ['indoor','indoor family attractions Ottawa Ontario']
  ]
};
export const OUTDOOR=new Set(['park','animals','landmark']);
export const FREE_CANDIDATES=new Set(['park','library']);
export const STORAGE_PREFIX='family:activities:v2:';
export const FEEDBACK_KEY='family:activities:feedback:v1';
export function normalizeOptions(input={}) {
  const mode=MODES.includes(input.mode)?input.mode:'family';
  const adults=Number.isInteger(Number(input.adults))?
    Math.max(1,Math.min(8,Number(input.adults))):(mode==='visits'?4:2);
  const kids=Number.isInteger(Number(input.kids))?
    Math.max(0,Math.min(10,Number(input.kids))):(mode==='couple'?0:2);
  const environment=ENVIRONMENTS.includes(input.environment)?input.environment:'all';
  const budget=BUDGETS.includes(input.budget)?input.budget:'any';
  const maxKm=DISTANCE_CHOICES.includes(Number(input.maxKm))?Number(input.maxKm):20;
  return {mode,adults,kids,environment,budget,maxKm};
}
export const keyFor=mode=>STORAGE_PREFIX+(MODES.includes(mode)?mode:'family');
export const safeSource=url=>{
  try{
    const u=new URL(url);
    return u.protocol==='https:' && !u.username && !u.password && u.hostname &&
      !/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname)?
      u.href:'';
  }catch{return '';}
};
export function validOrigin(request) {
  const u=new URL(request.url);
  const origin=request.headers.get('origin');
  const site=request.headers.get('sec-fetch-site');
  return origin===u.origin && (!site||site==='same-origin');
}
export function preferencesFrom(data) {
  const records=Array.isArray(data?.records)?data.records:[];
  return records.filter(x=>x && typeof x.id==='string'&&typeof x.category==='string'&&
    MODES.includes(x.mode)&&['like','dislike','visited'].includes(x.value)).slice(-200);
}
export function learnedCounts(records,mode){
  const counts={};
  for(const x of records)if(x.mode===mode){
    const row=counts[x.category]||(counts[x.category]={liked:0,disliked:0,visited:0});
    if(x.value==='like')row.liked++;
    if(x.value==='dislike')row.disliked++;
    if(x.value==='visited')row.visited++;
  }
  return counts;
}
