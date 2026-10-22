(function(){
'use strict';
const $=id=>document.getElementById(id),form=$('meal-form');
let meals=[],editingId='',photoValue='',savedImage='',working=false;
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function preview(image){$('photo-preview').innerHTML=image?'<img alt="Foto da refeição" src="'+esc(image)+'">':'<span>🍽️ Foto opcional</span>';}
function reset(){
 editingId='';savedImage='';photoValue='';form.reset();$('meal-minutes').value='30';
 $('editor-title').textContent='Adicionar refeição';$('save').textContent='Salvar refeição';
 preview('');$('meal-photo').value='';status('');
}
function renderList(){
 const query=$('filter').value.trim().toLocaleLowerCase('pt-BR');
 const selected=meals.filter(m=>(m.name+' '+(m.ingredients||[]).join(' ')).toLocaleLowerCase('pt-BR').includes(query));
 $('count').textContent=meals.length+' refeições cadastradas · '+selected.length+' exibidas';
 $('meals-list').innerHTML=selected.map(m=>'<article class="admin-meal">'+
 (m.image?'<img loading="lazy" src="'+esc(m.image)+'" alt="Foto: '+esc(m.name)+'">':'<div class="admin-no-photo">🍽️</div>')+
 '<div class="admin-meal-inner"><h3>'+esc(m.name)+'</h3><p>'+esc((m.ingredients||[]).slice(0,7).join(' · '))+'</p><div class="admin-meal-actions">'+
 '<button data-edit="'+esc(m.id)+'">✎ Editar</button><button class="secondary danger" data-delete="'+esc(m.id)+'">Excluir</button></div></div></article>').join('');
 if(!selected.length)$('meals-list').textContent='Nenhuma refeição encontrada.';
 $('meals-list').querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>startEdit(b.dataset.edit)));
 $('meals-list').querySelectorAll('[data-delete]').forEach(b=>b.addEventListener('click',()=>removeMeal(b.dataset.delete)));
}
async function api(method='GET',payload){
 const res=await fetch('/api/meals',{method,credentials:'same-origin',cache:'no-store',redirect:'manual',headers:method==='GET'?{}:{'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined});
 if(res.type==='opaqueredirect'||!res.headers.get('content-type')?.includes('application/json'))throw new Error('É necessário entrar no Cloudflare Access para gerenciar as refeições.');
 const data=await res.json();
 if(!res.ok)throw new Error(data.error||'Erro ao salvar no servidor.');
 return data;
}
async function load(){
 if(working)return;status('Buscando refeições no servidor…');
 try{const data=await api();meals=Array.isArray(data.meals)?data.meals:[];renderList();status('Cardápio sincronizado com o tablet.');}
 catch(e){status(e.message||'Não foi possível conectar ao servidor.',true);}
}
function startEdit(id){
 const m=meals.find(x=>x.id===id);if(!m)return;
 editingId=id;savedImage=m.image||'';photoValue=savedImage;
 $('meal-name').value=m.name;$('meal-ingredients').value=(m.ingredients||[]).join('\n');
 $('meal-description').value=m.description||'';$('meal-minutes').value=m.minutes||30;
 $('meal-photo').value='';preview(photoValue);
 $('editor-title').textContent='Editar: '+m.name;$('save').textContent='Salvar alterações';
 status('Editando '+m.name);window.scrollTo({top:0,behavior:'smooth'});$('meal-name').focus();
}
async function compress(file){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Envie uma foto JPEG, PNG ou WebP.');
 if(file.size>12*1024*1024)throw new Error('Foto grande demais (limite: 12 MB).');
 const url=URL.createObjectURL(file);
 try{
  const image=new Image();image.src=url;await image.decode();
  let scale=Math.min(1,800/Math.max(image.naturalWidth,image.naturalHeight));
  for(let round=0;round<5;round++){
   const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
   canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
   const encoded=canvas.toDataURL('image/webp',0.77-round*.08);
   if(encoded.length<=160000)return encoded;
   scale*=.79;
  }
  throw new Error('Não foi possível reduzir a foto. Tente uma menor.');
 } finally{URL.revokeObjectURL(url);}
}
$('meal-photo').addEventListener('change',async()=>{
 const file=$('meal-photo').files?.[0];if(!file)return;
 try{status('Otimizando foto…');photoValue=await compress(file);preview(photoValue);status('Foto pronta para salvar.');}
 catch(e){photoValue=savedImage;preview(photoValue);status(e.message,true);}
});
$('remove-photo').addEventListener('click',()=>{photoValue='';$('meal-photo').value='';preview('');status('Foto removida deste formulário. Salve para confirmar.');});
form.addEventListener('submit',async event=>{
 event.preventDefault();if(working)return;
 const ingredients=$('meal-ingredients').value.split(/[\n,;]/).map(s=>s.trim()).filter(Boolean);
 if(!ingredients.length){status('Informe pelo menos um ingrediente.',true);return;}
 const meal={name:$('meal-name').value.trim(),ingredients,description:$('meal-description').value.trim(),minutes:Number($('meal-minutes').value)||30,image:photoValue};
 if(editingId)meal.id=editingId;
 working=true;$('save').disabled=true;status('Salvando no Cloudflare…');
 try{
  const data=await api(editingId?'PUT':'POST',meal);meals=data.meals;renderList();reset();status('✓ Refeição salva! Ela aparecerá no tablet após a sincronização.');
 }catch(e){status(e.message,true);}
 finally{working=false;$('save').disabled=false;}
});
async function removeMeal(id){
 const m=meals.find(x=>x.id===id);if(!m||!window.confirm('Excluir "'+m.name+'" do cardápio?'))return;
 try{const data=await api('DELETE',{id});meals=data.meals;renderList();if(editingId===id)reset();status('Refeição excluída.');}
 catch(e){status(e.message,true);}
}
$('cancel').addEventListener('click',reset);
$('reload').addEventListener('click',load);
$('filter').addEventListener('input',renderList);
load();
})();