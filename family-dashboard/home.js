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
const ROMANCE='https://www.marriage.com/advice/relationship/things-for-couples-to-do-at-home-when-bored/';
const ROMANTIC_DINNER='https://www.marriage.com/advice/relationship/romantic-dinner-ideas-for-couples-at-home/';
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
// Couple is intentionally a distinct romantic date-night experience. No kids
// selector, games for young children, or generic board-game defaults.
const couple=[
 ['romantic-dinner','Jantar à meia-luz a dois','🕯️',75,'Prato preferido, guardanapos, luz indireta e playlist','Um jantar especial sem sair de casa',['Montem juntos uma mesa bonita e reduzam a luz usando velas LED','Preparem ou peçam o prato favorito de vocês','Guardem os celulares e façam um brinde ao melhor momento da semana'],ROMANTIC_DINNER],
 ['slow-dance','Dança lenta na sala','💃',30,'Playlist, caixa de som e espaço livre','Trocar a correria por conexão e música',['Escolham três músicas que tenham alguma lembrança especial','Apaguem a luz principal e deixem apenas iluminação suave','Dancem sem pressa e contem o que cada música faz lembrar'],ROMANCE],
 ['fondue','Fondue de chocolate romântico','🍓',40,'Chocolate, frutas lavadas, potinhos e guardanapos','Uma sobremesa compartilhada e aconchegante',['Derretam chocolate com cuidado ou usem calda pronta','Organizem frutas cortadas em uma bandeja bonita','Experimentem combinações e inventem o nome da sobremesa do casal'],ROMANTIC_DINNER],
 ['memory','Recriar o primeiro encontro','💕',60,'Música, fotos antigas e um lanche simbólico','Relembrar o começo da história de vocês',['Tentem recriar o ambiente do primeiro encontro com objetos de casa','Escolham uma música e um lanche que lembrem aquele dia','Contem um ao outro o que mais chamou atenção no primeiro encontro'],ROMANCE],
 ['questions','Cartões de perguntas românticas','💌',35,'Papel, caneta e uma bebida sem álcool','Conversar com atenção e redescobrir detalhes',['Escrevam perguntas como “qual lembrança te faz sorrir?”','Sorteiem seis perguntas, revezando quem responde primeiro','Terminem dizendo algo que admiram um no outro'],ROMANCE],
 ['spa-romance','Spa relaxante para o casal','🫧',55,'Toalhas macias, creme habitual e música tranquila','Relaxar e cuidar um do outro',['Organizem o ambiente com toalhas, luz suave e música','Façam um escalda-pés morno e confortável, se desejarem','Revezem uma massagem suave nas mãos, respeitando o conforto do outro'],ROMANCE],
 ['living-picnic','Piquenique romântico na sala','🧺',45,'Manta, almofadas, petiscos e suco','Transformar uma noite normal em um encontro',['Estendam uma manta no chão com almofadas confortáveis','Preparem uma bandeja de petiscos e uma bebida especial','Conversem sobre um lugar que gostariam de visitar juntos'],ROMANCE],
 ['love-notes','Bilhetes de amor e gratidão','💗',30,'Papel, envelope e canetas','Surpreender com palavras carinhosas',['Cada pessoa escreve três coisas que aprecia no outro','Troquem um envelope com os bilhetes e leiam com calma','Guardem uma mensagem para abrir em outra data'],ROMANCE],
 ['romance-movie','Cinema romântico com sobremesa','🎞️',120,'Filme escolhido por vocês, cobertor e sobremesa','Assistir juntos com clima de encontro',['Escolham um filme disponível e do gosto dos dois','Preparem luz baixa, cobertor e a sobremesa preferida','Após o filme compartilhem sua cena favorita'],ROMANCE],
 ['tasting-two','Degustação a dois de mocktails','🥂',40,'Frutas, gelo, sucos e copos bonitos','Brindar sem precisar sair de casa',['Criem duas combinações de bebidas sem álcool','Preparem os copos com frutas e uma decoração simples','Dêem nomes românticos às bebidas e façam um brinde'],ROMANCE],
 ['couple-photo','Ensaio de fotos a dois','📷',40,'Celular, apoio estável e luz suave','Guardar lembranças espontâneas',['Arrumem um cantinho com iluminação aconchegante','Usem o temporizador para fazer retratos juntos','Escolham a melhor foto para guardar ou imprimir'],ROMANCE],
 ['star-evening','Uma noite de planos e sonhos','✨',35,'Cobertor, bebida quente e papel','Imaginar bons momentos para o futuro',['Sentem juntos em um cantinho confortável','Cada um sugere uma viagem, uma experiência e um desejo simples','Escolham um dos planos para colocar no calendário'],ROMANCE]
];
const adults=[
 ['tasting','Degustação divertida de mocktails','🍹',40,'Sucos, frutas, gelo e copos','Descobrir sabores e fazer um brinde',['Escolham três combinações de fruta e bebida sem álcool','Preparem doses pequenas e inventem os nomes','Votem no favorito e anotem a receita'],PLAY],
 ['boardduo','Jogos de cartas e conversa','🃏',40,'Baralho ou jogo para 2','Rir e competir de maneira leve',['Separem um jogo simples conhecido por todos','Joguem três partidas curtas','A pessoa vencedora escolhe a próxima música'],GAMES],
 ['dinner','Jantar temático em casa','🍝',70,'Ingredientes que já têm em casa','Uma ocasião especial sem sair de casa',['Definam um tema: italiano, brasileiro ou noite de tapas','Dividam o preparo e montem uma mesa diferente','Preparem uma playlist combinando com o tema'],PLAY],
 ['spa','Noite de relaxamento','🕯️',40,'Toalhas, música e chá','Desacelerar a rotina',['Diminuam a iluminação e coloquem uma música tranquila','Preparem chá e façam uma pausa sem celulares','Conversem sobre uma boa lembrança da semana'],PLAY],
 ['moviecouple','Sessão de cinema em casa','🎬',120,'Um filme disponível e petiscos','Cinema confortável em casa',['Escolham um filme que todos queiram ver','Preparem petiscos e deixem o celular de lado','Conversem sobre o final depois da sessão'],PLAY],
 ['blind','Desafio de sabores às cegas','🍫',30,'Alimentos conhecidos e utensílios','Descobrir sabores e conversar',['Verifiquem alergias e separem três alimentos simples','Alternem quem tenta identificar os sabores de olhos fechados','Marquem os pontos e troquem os papéis'],PLAY],
 ['photo','Desafio de fotografia pela casa','📸',40,'Celular ou câmera fotográfica','Explorar criatividade',['Definam três temas: luz, textura e detalhe','Cada pessoa fotografa 5 cenas diferentes','Compare as composições e escolham uma favorita'],PLAY],
 ['plan','Planejem um passeio surpresa','🗓️',30,'Mapa ou calendário e papel','Criar um programa futuro',['Cada pessoa escreve três ideias de passeio','Troquem as ideias sem olhar a lista do outro','Escolham uma para organizar no calendário'],PLAY]
];
const visitsKids=[
 ['visits-welcome','Boas-vindas com mocktails','🍹',30,'Frutas, suco, água com gás e copos','Receber bem as visitas, com crianças participando',['As crianças criam nomes para os drinks sem álcool','Montem bebidas com frutas lavadas e copos seguros','Façam um brinde de boas-vindas e apresentem os convidados'],PLAY],
 ['visits-board','Jogos rápidos para todos','🎲',45,'Jogo de cartas ou tabuleiro simples','Quebrar o gelo entre família e visitas',['Escolha uma brincadeira que o mais novo consiga jogar','Dividam as pessoas em equipes mistas','Façam rodadas curtas e comemorem todos os participantes'],GAMES],
 ['visits-tour','Tour divertido pela casa','🏡',25,'Papel e canetinhas','Apresentar a casa como uma brincadeira',['Cada criança escolhe um cantinho favorito para mostrar','Inventem três pistas sobre os espaços da casa','As visitas tentam adivinhar a resposta'],PBS],
 ['visits-cinema','Cinema em família com convidados','🍿',105,'Filme infantil disponível e petiscos','Uma sessão de cinema em grupo',['Escolham um filme com classificação adequada à criança mais nova','Preparem ingressos e montem um canto de cinema','Conversem sobre a cena favorita depois de assistir'],PLAY],
 ['visits-science','Ciência para as visitas','🧪',35,'Amido de milho, água e uma tigela','Surpreender com uma experiência interativa',['Façam juntos uma mistura de água com amido','Observem quando ela resiste à pressão das mãos','Comparem o resultado e limpem o espaço'],SCIENCE],
 ['visits-photo','Foto temática em família','📸',35,'Celular e adereços caseiros','Guardar a lembrança da visita',['Escolham um tema divertido para as fotos','Criem adereços de papel sem pontas afiadas','Tirem fotos em grupos mistos e uma de todos juntos'],PLAY],
 ['visits-picnic','Piquenique indoor de boas-vindas','🧺',45,'Manta, frutas e petiscos','Receber visitas sem precisar sair',['Preparem a área de piquenique na sala','As crianças ajudam a distribuir copos e guardanapos','Compartilhem histórias de viagens e passeios'],PLAY],
 ['visits-quiz','Quiz da família para convidados','❓',35,'Papel, caneta e perguntas simples','Fazer todo mundo participar',['Escrevam perguntas leves sobre interesses da família','Façam duplas com moradores e visitantes','Revezem as perguntas e contem histórias das respostas'],GAMES]
];
const visitsAdults=[
 ['guests-dinner','Jantar de boas-vindas','🍽️',80,'Ingredientes, mesa posta e música','Receber as visitas com uma refeição marcante',['Escolham uma receita fácil com ingredientes conhecidos','Preparem a mesa juntos com música ambiente','Aproveitem para trocar histórias de família'],ROMANTIC_DINNER],
 ['guests-tasting','Degustação de mocktails com visitas','🍹',35,'Suco, frutas e copos','Criar um momento de conversa',['Montem três combinações de sucos sem álcool','Deixem que cada convidado dê um nome à sua bebida','Escolham juntos a combinação mais gostosa'],PLAY],
 ...adults.slice(1,7)
];
const videos={
 // Vetted public YouTube videos; embedded only on an explicit user tap.
 science:'ZmY1O9eWt-Y',shadow:'TFBRCPoyeqI',
 'visits-science':'ZmY1O9eWt-Y'
};
const mk=(row,audience)=>({id:'home:'+row[0],kind:'home',name:row[1],icon:row[2],duration:row[3],bring:row[4],why:row[5],steps:row[6],sourceUrl:row[7],audience,videoId:videos[row[0]]||'',category:'home'});
function generate({kids=true,mode='family',rotation=0}={}){
 const base=mode==='couple'?couple:mode==='visits'?(kids?visitsKids:visitsAdults):kids?family:adults;
 const offset=((Math.trunc(Number(rotation)||0)%base.length)+base.length)%base.length;
 const selected=base.slice(offset).concat(base.slice(0,offset)).map(row=>mk(row,kids?'kids':mode));
 return selected;
}
window.HomeIdeas={generate};
})();
