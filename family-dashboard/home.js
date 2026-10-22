/* Public instructional activity links selected from PBS KIDS, NASA,
   Science World and HealthyChildren.org. No model calls, geolocation or
   invented daily events. Refresh rotates a reproducible local shortlist. */
(function(){'use strict';
const PBS='https://www.pbs.org/parents/thrive/8-indoor-activities-to-release-kids-energy';
const HALLOWEEN='https://www.pbs.org/parents/thrive/7-fun-halloween-activities-to-do-at-home';
const SCIENCE='https://www.scienceworld.ca/bslh-athome/';
const NASA='https://www.nasa.gov/nasa-at-home-for-kids-and-families/';
const GAMES='https://www.healthychildren.org/English/family-life/power-of-play/Pages/swapping-play-for-screen-tme-during-school-breaks.aspx';
const PLAY='https://www.healthychildren.org/English/family-life/power-of-play/Pages/the-power-of-play-how-fun-and-games-help-children-thrive.aspx';
// id, title, illustration, minutes, needs, purpose, 3 chronological steps, source
const family=[
 ['hunt','Caça ao tesouro dentro de casa','🗺️',30,'Papel, lápis e 6 objetos','Criatividade e trabalho em equipe',['Esconda 6 objetos seguros pela casa','Desenhe pistas simples para Apollo e desafios de leitura para Luna','Procurem juntos; cada pista leva à próxima'],PBS],
 ['board','Campeonato de jogos de tabuleiro','🎲',45,'Um jogo de tabuleiro ou baralho','Todos jogam juntos, sem telas',['Escolha um jogo indicado para a idade mais nova','Organize três rodadas curtas e revezem quem explica as regras','Finalizem com um prêmio simbólico para todos'],GAMES],
 ['mocktail','Bar de drinks sem álcool','🍓',25,'Suco, água com gás, frutas, gelo','Criar bebidas temáticas em família',['Separe copos seguros e frutas previamente lavadas','Cada pessoa inventa um mocktail e dá um nome criativo','Façam uma degustação e votem no mais bonito'],PLAY],
 ['movie','Cinema em casa + ingressos','🍿',105,'Filme adequado, pipoca e almofadas','Uma noite de cinema com ritual divertido',['Escolham um filme que vocês já tenham acesso e adequado à idade','Criem ingressos de papel e arrumem o sofá','Após o filme cada pessoa conta sua cena favorita'],PLAY],
 ['science','Massinha científica de amido','🧪',35,'Amido de milho, água, pote e toalha','Conhecer misturas e suas propriedades',['Misture água aos poucos com amido de milho em uma tigela','Aperte rapidamente e depois deixe escorrer entre os dedos','Pergunte por que parece sólido e líquido; limpe a bancada'],SCIENCE],
 ['shadow','Teatro de sombras','🎭',30,'Lanterna, papel e parede livre','Histórias criativas com luz',['Recortem personagens de papel com ajuda de um adulto','Apaguem a luz e apontem a lanterna para a parede','Cada criança conta uma parte da história'],SCIENCE],
 ['lego','Desafio de construção','🧱',40,'LEGO, blocos ou caixas de papelão','Imaginação e solução de problemas',['Escolha o tema: cidade, castelo ou base lunar','Cada pessoa constrói uma parte por 15 minutos','Juntem as criações e inventem uma história'],NASA],
 ['puzzle','Missão quebra-cabeça cooperativa','🧩',35,'Quebra-cabeça adequado à idade','Colaboração e paciência',['Separem as peças de borda e centro','Deem tarefas a cada participante e troquem a cada 10 minutos','Montem juntos e registrem o tempo como brincadeira'],GAMES],
 ['halloween','Missão de Halloween na sala','🎃',45,'Papel, fantasias e pequenos prêmios','Uma caça temática de outubro',['Esconda símbolos de Halloween desenhados em papel','Prepare pistas com dificuldade diferente para as duas crianças','Montem fantasias e façam o desafio final'],HALLOWEEN],
 ['moon','Missão astronautas da NASA','🚀',45,'Papel, fita, caixa de papelão','Aprender sobre o espaço enquanto brincam',['Criem uma base lunar de papelão','Desenhem missões e designem funções a cada astronauta','Simulem aterrissagem e exploração da Lua'],NASA],
 ['obstacles','Circuito de obstáculos leve','🤸',30,'Almofadas, fita e espaço livre','Movimento indoor de forma segura',['Afaste objetos frágeis e organize um trajeto baixo','Alternem saltos leves e equilíbrio sobre uma linha de fita','Cronometrem a volta sem competir por velocidade'],PBS],
 ['detective','Detetives de pegadas','🔎',35,'Papel, lápis, objetos e lupa opcional','Observação e curiosidade',['Faça marcas de lápis com o contorno de objetos','Esconda alguns objetos e entregue as pistas','As crianças identificam o objeto pela forma e textura'],SCIENCE]
];
const adults=[
 ['tasting','Noite de degustação de mocktails','🍹',40,'Sucos, frutas, gelo e copos','Descobrir sabores e fazer um brinde',['Escolham três combinações de fruta e bebida sem álcool','Preparem doses pequenas e inventem os nomes','Votem no favorito e anotem a receita'],PLAY],
 ['boardduo','Jogos de cartas a dois','🃏',40,'Baralho ou jogo para 2','Rir e competir de maneira leve',['Separem um jogo simples conhecido pelos dois','Joguem três partidas curtas','A pessoa vencedora escolhe a próxima música'],GAMES],
 ['dinner','Jantar temático feito em dupla','🍝',70,'Ingredientes que já têm em casa','Um encontro sem sair de casa',['Definam um tema: italiano, brasileiro ou noite de tapas','Dividam o preparo e montem uma mesa diferente','Preparem uma playlist combinando com o tema'],PLAY],
 ['spa','Spa caseiro e relaxamento','🕯️',40,'Toalhas, música e chá','Desacelerar a rotina juntos',['Diminuam a iluminação e coloquem uma música tranquila','Preparem chá e façam uma pausa sem celulares','Conversem sobre uma boa lembrança da semana'],PLAY],
 ['moviecouple','Sessão de cinema para dois','🎬',120,'Um filme disponível e petiscos','Cinema confortável em casa',['Escolham um filme que ambos queiram ver','Preparem petiscos e deixem o celular de lado','Conversem sobre o final depois da sessão'],PLAY],
 ['blind','Desafio de sabores às cegas','🍫',30,'Alimentos conhecidos e utensílios','Descobrir sabores e conversar',['Verifiquem alergias e separem três alimentos simples','Alternem quem tenta identificar os sabores de olhos fechados','Marquem os pontos e troquem os papéis'],PLAY],
 ['photo','Desafio de fotografia pela casa','📸',40,'Celular ou câmera fotográfica','Explorar criatividade em dupla',['Definam três temas: luz, textura e detalhe','Cada pessoa fotografa 5 cenas diferentes','Compare as composições e escolham uma favorita'],PLAY],
 ['plan','Planejem um passeio surpresa','🗓️',30,'Mapa ou calendário e papel','Criar um programa futuro juntos',['Cada pessoa escreve três ideias de passeio','Troquem as ideias sem olhar a lista do outro','Escolham uma para organizar no calendário'],PLAY]
];
const mk=(row,audience)=>({id:'home:'+row[0],kind:'home',name:row[1],icon:row[2],duration:row[3],bring:row[4],why:row[5],steps:row[6],sourceUrl:row[7],audience,category:'home'});
function generate({kids=true,mode='family',rotation=0}={}){
 const base=kids?family:adults;
 const offset=((Math.trunc(Number(rotation)||0)%base.length)+base.length)%base.length;
 const selected=base.slice(offset).concat(base.slice(0,offset)).map(row=>mk(row,kids?'kids':mode));
 return selected;
}
window.HomeIdeas={generate};
})();
