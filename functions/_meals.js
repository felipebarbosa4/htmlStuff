export const STARTER_MEALS = [
{id:'prato-frango',name:'Arroz, feijão e frango grelhado',ingredients:['Arroz','Feijão carioca ou preto','Peito de frango','Alho','Cebola','Salada de alface e tomate'],description:'O almoço brasileiro do dia a dia.',image:'/family-dashboard/meals/photos/frango-arroz-feijao.webp',minutes:30},
{id:'strogonoff-frango',name:'Estrogonofe de frango',ingredients:['Frango em cubos','Creme de leite','Molho de tomate','Cebola','Arroz branco','Batata palha'],description:'Clássico simples com arroz e batata palha.',image:'/family-dashboard/meals/photos/estrogonofe.webp',minutes:30},
{id:'macarrao-bolonhesa',name:'Macarrão à bolonhesa',ingredients:['Macarrão','Carne moída','Molho de tomate','Cebola','Alho','Queijo ralado'],description:'Macarrão com molho de carne moída.',image:'/family-dashboard/meals/photos/macarrao.webp',minutes:30},
{id:'arroz-feijao-ovo',name:'Arroz, feijão e ovo',ingredients:['Arroz branco','Feijão','Ovos','Alho','Tomate','Alface'],description:'Rápido, econômico e gostoso.',image:'/family-dashboard/meals/photos/arroz-feijao-ovo.webp',minutes:20},
{id:'feijao-tropeiro',name:'Feijão tropeiro',ingredients:['Feijão cozido','Farinha de mandioca','Ovos','Bacon ou linguiça','Cebola','Cheiro-verde'],description:'Comida caseira bem brasileira.',image:'/family-dashboard/meals/photos/feijao-tropeiro.webp',minutes:35},
{id:'frango-assado-batata',name:'Frango assado com batatas',ingredients:['Coxa ou sobrecoxa','Batata','Limão','Alho','Azeite','Arroz para acompanhar'],description:'Prato de forno simples para a família.',image:'/family-dashboard/meals/photos/frango-assado.webp',minutes:55},
{id:'arroz-feijao-carne',name:'Arroz, feijão e bife',ingredients:['Arroz','Feijão','Bife bovino','Alho','Cebola','Tomate'],description:'Prato feito tradicional.',image:'/family-dashboard/meals/photos/prato-feito.webp',minutes:30},
{id:'macarrao-alho-oleo',name:'Macarrão alho e óleo com frango',ingredients:['Espaguete','Alho','Azeite','Frango desfiado','Salsinha','Queijo ralado (opcional)'],description:'Uma refeição prática com poucos ingredientes.',image:'/family-dashboard/meals/photos/espaguete.webp',minutes:25},
{id:'galinhada',name:'Galinhada simples',ingredients:['Arroz','Frango em pedaços','Tomate','Cebola','Alho','Milho ou ervilha'],description:'Arroz com frango feito numa panela só.',image:'/family-dashboard/meals/photos/galinhada.webp',minutes:40},
{id:'omelete-salada',name:'Omelete com salada',ingredients:['Ovos','Tomate','Queijo (opcional)','Cebola','Alface','Azeite'],description:'Almoço leve nos dias corridos.',image:'/family-dashboard/meals/photos/omelete.webp',minutes:15},
{id:'carne-moida-batata',name:'Carne moída com batata',ingredients:['Carne moída','Batata em cubos','Molho de tomate','Cebola','Alho','Arroz'],description:'Misturadinho caseiro que rende bem.',image:'/family-dashboard/meals/photos/carne-moida.webp',minutes:35},
{id:'panqueca-carne',name:'Panqueca de carne moída',ingredients:['Farinha de trigo','Leite','Ovos','Carne moída','Molho de tomate','Queijo'],description:'Panquecas recheadas e cobertas com molho.',image:'/family-dashboard/meals/photos/panqueca.webp',minutes:45}
];
export const STORAGE_KEY='family:meals:catalog:v1';
export const MAX_MEALS=60;
export function baseList(){return STARTER_MEALS.map(x=>({...x,starter:true}));}
export function cleanMeal(payload,{update=false}={}) {
 if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('Dados inválidos.');
 const name=String(payload.name||'').trim().slice(0,90);
 if(name.length<3)throw new Error('Informe o nome da refeição.');
 const raw=payload.ingredients;
 if(!Array.isArray(raw)||raw.length<1||raw.length>24)throw new Error('Informe de 1 a 24 ingredientes.');
 const ingredients=raw.map(x=>String(x||'').trim().slice(0,85)).filter(Boolean);
 if(!ingredients.length)throw new Error('Informe pelo menos um ingrediente.');
 const description=String(payload.description||'').trim().slice(0,240);
 const minutes=Math.min(180,Math.max(5,Number(payload.minutes)||30));
 const image=String(payload.image||'');
 if(image && !(image.startsWith('/family-dashboard/meals/photos/') && /^[\w\-/]+\.webp$/.test(image) ||
 /^data:image\/(?:webp|jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(image)&&image.length<=170000))throw new Error('Foto inválida ou grande demais. Use uma imagem menor.');
 return {name,ingredients,description,minutes:Math.round(minutes),image,starter:false};
}
