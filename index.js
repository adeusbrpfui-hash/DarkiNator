const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Fetch universal — node-fetch v2 ou https nativo
let fetch;
try {
  fetch = require('node-fetch');
  if (typeof fetch !== 'function') throw new Error('not a function');
} catch(e) {
  const https = require('https');
  const http = require('http');
  fetch = (url, opts={}) => new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(url, { method: opts.method||'GET', headers: opts.headers||{} }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({
        ok: res.statusCode < 300,
        status: res.statusCode,
        json: () => Promise.resolve(JSON.parse(data)),
        text: () => Promise.resolve(data)
      }));
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// ============================================================
// PATHS E VARIÁVEIS
// ============================================================
const DATA_DIR = fs.existsSync('/data') ? '/data' : __dirname;
const DB_PATH       = path.join(DATA_DIR, 'db.json');
const TITULOS_PATH  = path.join(DATA_DIR, 'titulos.json');
const FILA_PATH     = path.join(DATA_DIR, 'fila.json');
const PERGS_PATH    = path.join(DATA_DIR, 'perguntas_dinamicas.json');

const TMDB_KEY  = process.env.TMDB_KEY || '8265bd1679663a7ea12ac168da84d2e8';
const OR_KEY    = process.env.OPENROUTER_KEY || '';
const OR_MODEL  = 'google/gemini-2.0-flash-exp:free';

// ============================================================
// HELPERS JSON
// ============================================================
function lerJSON(p, def) {
  try { if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8')); } catch {}
  return def;
}
function salvar(p, d) {
  try { fs.writeFileSync(p, JSON.stringify(d, null, 2)); } catch(e) { console.error('salvar err:', e.message); }
}
const lerDB      = () => lerJSON(DB_PATH,      { usuarios:[], resultados:[], comentarios:[] });
const salvarDB   = d  => salvar(DB_PATH, d);
const lerTitulos = () => lerJSON(TITULOS_PATH, { titulos:[], expansaoHoje:0, ultimaExpansao:'' });
const salvarTitulos = d => salvar(TITULOS_PATH, d);
const lerFila    = () => lerJSON(FILA_PATH,    { pendentes:[], processados:[] });
const salvarFila = d  => salvar(FILA_PATH, d);
const lerPergs   = () => lerJSON(PERGS_PATH,   { perguntas:[], ultimaGeracao:'' });
const salvarPergs = d => salvar(PERGS_PATH, d);

// ============================================================
// BANCO INICIAL — 25 TÍTULOS COM TAGS COMPLETAS
// ============================================================
const TITULOS_INICIAIS = [
  {id:'t001',tmdb:217,   nome:'Chaves',                          nomeOriginal:'El Chavo del Ocho',          tipo:'tv',    raridade:'comum', capa:'https://image.tmdb.org/t/p/w500/iODFGNDmuUFWBQBiuKcGsVbMCdN.jpg', sinopse:'Série cômica mexicana sobre um menino órfão chamado Chaves que mora num barril numa vila pobre. Com seus amigos Quico, Chiquinha e os adultos vizinhos, vive situações engraçadas no México dos anos 70.',  tags:{filme:-1,pos2010:-1,acao:-1,fantasia:-1,scifi:-1,americano:-1,poderes:-1,historico:-1,comedia:1,adulto:-1,longo:-1,oscar:-1,adaptacao:-1,franquia:1,vilao:-1,finaltriste:-1,romance:-1,animacao:-1,criancas:1,espaco:-1,crime:-1,guerra:-1,antiheroi:-1,terror:-1,trilhafamosa:1,ante2000:1,reviravolta:-1,sobrevive:1,viagemtempo:-1,baseadofatos:-1,maisdeuma:1,anime:-1,superheroi:-1,amizade:1,naohuman:-1,classico:1,muitosprot:1,posapoc:-1,protmulher:-1,danca:-1,mexico:1,brasil:-1,japao:-1,infantil:1,orfao:1,magia:-1,esporte:-1,musical:-1,policial:-1,sobrenatural:-1,familia:1,vinganca:-1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:1,mitologia:-1}},
  {id:'t002',tmdb:1425,  nome:'Winx Club',                       nomeOriginal:'Winx Club',                  tipo:'tv',    raridade:'medio', capa:'https://image.tmdb.org/t/p/w500/mTOuB5UMF2oVGbdHGSCFEqDlqpP.jpg', sinopse:'Grupo de fadas adolescentes chamadas Winx estudam na escola Alfea e usam seus poderes mágicos para proteger o universo de vilões. Bloom, Stella, Flora, Musa, Tecna e Aisha formam o time.',              tags:{filme:-1,pos2010:-1,acao:1,fantasia:1,scifi:-1,americano:-1,poderes:1,historico:-1,comedia:-1,adulto:-1,longo:-1,oscar:-1,adaptacao:-1,franquia:1,vilao:1,finaltriste:-1,romance:1,animacao:1,criancas:1,espaco:-1,crime:-1,guerra:-1,antiheroi:-1,terror:-1,trilhafamosa:1,ante2000:-1,reviravolta:-1,sobrevive:1,viagemtempo:-1,baseadofatos:-1,maisdeuma:1,anime:-1,superheroi:1,amizade:1,naohuman:-1,classico:-1,muitosprot:1,posapoc:-1,protmulher:1,danca:-1,mexico:-1,brasil:-1,japao:-1,infantil:1,orfao:-1,magia:1,esporte:-1,musical:-1,policial:-1,sobrenatural:1,familia:-1,vinganca:-1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:1,mitologia:-1}},
  {id:'t003',tmdb:12171, nome:'Dragon Ball Z',                   nomeOriginal:'Dragon Ball Z',              tipo:'tv',    raridade:'comum', capa:'https://image.tmdb.org/t/p/w500/oSJaWvxDpnMXEpKFJBTzDHxn6uw.jpg', sinopse:'Goku e seus amigos guerreiros Z defendem a Terra de vilões cada vez mais poderosos como Freeza, Cell e Majin Boo. Combates épicos, transformações Super Saiyajin e amizade são temas centrais.',          tags:{filme:-1,pos2010:-1,acao:1,fantasia:1,scifi:-1,americano:-1,poderes:1,historico:-1,comedia:-1,adulto:-1,longo:-1,oscar:-1,adaptacao:1,franquia:1,vilao:1,finaltriste:-1,romance:-1,animacao:1,criancas:1,espaco:1,crime:-1,guerra:1,antiheroi:-1,terror:-1,trilhafamosa:1,ante2000:1,reviravolta:1,sobrevive:1,viagemtempo:1,baseadofatos:-1,maisdeuma:1,anime:1,superheroi:1,amizade:1,naohuman:1,classico:1,muitosprot:1,posapoc:-1,protmulher:-1,danca:-1,mexico:-1,brasil:-1,japao:1,infantil:1,orfao:-1,magia:-1,esporte:-1,musical:-1,policial:-1,sobrenatural:-1,familia:1,vinganca:-1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:-1,mitologia:-1}},
  {id:'t004',tmdb:46260, nome:'Attack on Titan',                 nomeOriginal:'Shingeki no Kyojin',         tipo:'tv',    raridade:'medio', capa:'https://image.tmdb.org/t/p/w500/hTP1DtLGFAmAn92954tFmkgAToe.jpg', sinopse:'Em um mundo onde a humanidade vive atrás de muros gigantes para se proteger de titãs devoradores de humanos, Eren Yeager jura destruir todos os titãs após sua mãe ser devorada.',                    tags:{filme:-1,pos2010:1,acao:1,fantasia:1,scifi:-1,americano:-1,poderes:1,historico:-1,comedia:-1,adulto:1,longo:-1,oscar:-1,adaptacao:1,franquia:1,vilao:1,finaltriste:1,romance:-1,animacao:1,criancas:-1,espaco:-1,crime:-1,guerra:1,antiheroi:1,terror:1,trilhafamosa:1,ante2000:-1,reviravolta:1,sobrevive:-1,viagemtempo:-1,baseadofatos:-1,maisdeuma:1,anime:1,superheroi:-1,amizade:1,naohuman:1,classico:-1,muitosprot:1,posapoc:-1,protmulher:-1,danca:-1,mexico:-1,brasil:-1,japao:1,infantil:-1,orfao:1,magia:-1,esporte:-1,musical:-1,policial:-1,sobrenatural:-1,familia:-1,vinganca:1,survival:1,distopia:1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:-1,mitologia:-1}},
  {id:'t005',tmdb:37854, nome:'One Piece',                       nomeOriginal:'One Piece',                  tipo:'tv',    raridade:'comum', capa:'https://image.tmdb.org/t/p/w500/e3NBGiAifW9Xt8xD5tQfOtNPXDY.jpg', sinopse:'Monkey D. Luffy, um jovem com poderes de borracha, navega pelos mares Grand Line com sua tripulação pirata em busca do lendário tesouro One Piece para se tornar o Rei dos Piratas.',             tags:{filme:-1,pos2010:-1,acao:1,fantasia:1,scifi:-1,americano:-1,poderes:1,historico:-1,comedia:1,adulto:-1,longo:-1,oscar:-1,adaptacao:1,franquia:1,vilao:1,finaltriste:-1,romance:-1,animacao:1,criancas:1,espaco:-1,crime:-1,guerra:1,antiheroi:-1,terror:-1,trilhafamosa:1,ante2000:1,reviravolta:1,sobrevive:1,viagemtempo:-1,baseadofatos:-1,maisdeuma:1,anime:1,superheroi:-1,amizade:1,naohuman:1,classico:1,muitosprot:1,posapoc:-1,protmulher:-1,danca:-1,mexico:-1,brasil:-1,japao:1,infantil:1,orfao:1,magia:-1,esporte:-1,musical:-1,policial:-1,sobrenatural:-1,familia:1,vinganca:-1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:-1,mitologia:-1}},
  {id:'t006',tmdb:1396,  nome:'Breaking Bad',                    nomeOriginal:'Breaking Bad',               tipo:'tv',    raridade:'comum', capa:'https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5L9pCfOacjizRGt.jpg', sinopse:'Walter White, professor de química com câncer terminal, começa a fabricar metanfetamina com seu ex-aluno Jesse Pinkman para garantir o futuro financeiro da família.',                              tags:{filme:-1,pos2010:-1,acao:-1,fantasia:-1,scifi:-1,americano:1,poderes:-1,historico:-1,comedia:-1,adulto:1,longo:-1,oscar:1,adaptacao:-1,franquia:-1,vilao:1,finaltriste:1,romance:-1,animacao:-1,criancas:-1,espaco:-1,crime:1,guerra:-1,antiheroi:1,terror:-1,trilhafamosa:1,ante2000:-1,reviravolta:1,sobrevive:-1,viagemtempo:-1,baseadofatos:-1,maisdeuma:1,anime:-1,superheroi:-1,amizade:-1,naohuman:-1,classico:1,muitosprot:-1,posapoc:-1,protmulher:-1,danca:-1,mexico:-1,brasil:-1,japao:-1,infantil:-1,orfao:-1,magia:-1,esporte:-1,musical:-1,policial:1,sobrenatural:-1,familia:1,vinganca:-1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:-1,mitologia:-1}},
  {id:'t007',tmdb:1399,  nome:'Game of Thrones',                 nomeOriginal:'Game of Thrones',            tipo:'tv',    raridade:'comum', capa:'https://image.tmdb.org/t/p/w500/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg', sinopse:'Famílias nobres guerreiam pelo Trono de Ferro dos Sete Reinos de Westeros num mundo de fantasia épica com dragões, magia e traições. Baseado nos livros de George R.R. Martin.',              tags:{filme:-1,pos2010:1,acao:1,fantasia:1,scifi:-1,americano:1,poderes:1,historico:1,comedia:-1,adulto:1,longo:-1,oscar:1,adaptacao:1,franquia:-1,vilao:1,finaltriste:1,romance:1,animacao:-1,criancas:-1,espaco:-1,crime:1,guerra:1,antiheroi:1,terror:-1,trilhafamosa:1,ante2000:-1,reviravolta:1,sobrevive:-1,viagemtempo:-1,baseadofatos:-1,maisdeuma:1,anime:-1,superheroi:-1,amizade:-1,naohuman:1,classico:1,muitosprot:1,posapoc:-1,protmulher:1,danca:-1,mexico:-1,brasil:-1,japao:-1,infantil:-1,orfao:-1,magia:1,esporte:-1,musical:-1,policial:-1,sobrenatural:1,familia:-1,vinganca:1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:-1,mitologia:1}},
  {id:'t008',tmdb:66732, nome:'Stranger Things',                 nomeOriginal:'Stranger Things',            tipo:'tv',    raridade:'comum', capa:'https://image.tmdb.org/t/p/w500/49WJfeN0moxb9IPfGn8AIqMGskD.jpg', sinopse:'Em Hawkins, Indiana nos anos 80, um grupo de crianças enfrenta forças sobrenaturais do Mundo Invertido. Eleven, com poderes telecinéticos, é central na luta contra criaturas e o governo.',         tags:{filme:-1,pos2010:1,acao:1,fantasia:1,scifi:1,americano:1,poderes:1,historico:-1,comedia:-1,adulto:-1,longo:-1,oscar:-1,adaptacao:-1,franquia:-1,vilao:1,finaltriste:-1,romance:1,animacao:-1,criancas:1,espaco:-1,crime:-1,guerra:-1,antiheroi:-1,terror:1,trilhafamosa:1,ante2000:-1,reviravolta:1,sobrevive:1,viagemtempo:-1,baseadofatos:-1,maisdeuma:1,anime:-1,superheroi:-1,amizade:1,naohuman:1,classico:-1,muitosprot:1,posapoc:-1,protmulher:-1,danca:-1,mexico:-1,brasil:-1,japao:-1,infantil:-1,orfao:-1,magia:-1,esporte:-1,musical:-1,policial:-1,sobrenatural:1,familia:1,vinganca:-1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:-1,mitologia:-1}},
  {id:'t009',tmdb:238,   nome:'O Poderoso Chefão',               nomeOriginal:'The Godfather',              tipo:'movie', raridade:'medio', capa:'https://image.tmdb.org/t/p/w500/3bhkrj58Vtu7enYsLegHnDmni2.jpg', sinopse:'Vito Corleone é o patriarca da poderosa família Corleone da máfia italiana em Nova York. Quando recusa uma proposta do rival Sollozzo, começa uma guerra entre famílias que transformará seu filho Michael.',   tags:{filme:1,pos2010:-1,acao:-1,fantasia:-1,scifi:-1,americano:1,poderes:-1,historico:1,comedia:-1,adulto:1,longo:1,oscar:1,adaptacao:1,franquia:1,vilao:1,finaltriste:1,romance:1,animacao:-1,criancas:-1,espaco:-1,crime:1,guerra:-1,antiheroi:1,terror:-1,trilhafamosa:1,ante2000:1,reviravolta:1,sobrevive:-1,viagemtempo:-1,baseadofatos:-1,maisdeuma:1,anime:-1,superheroi:-1,amizade:-1,naohuman:-1,classico:1,muitosprot:1,posapoc:-1,protmulher:-1,danca:-1,mexico:-1,brasil:-1,japao:-1,infantil:-1,orfao:-1,magia:-1,esporte:-1,musical:-1,policial:1,sobrenatural:-1,familia:1,vinganca:1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:-1,mitologia:-1}},
  {id:'t010',tmdb:155,   nome:'Batman: O Cavaleiro das Trevas',  nomeOriginal:'The Dark Knight',            tipo:'movie', raridade:'comum', capa:'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg', sinopse:'Batman enfrenta o Coringa, um agente do caos que aterroriza Gotham City. Com Harvey Dent e a tenente Gordon, Bruce Wayne tenta salvar a cidade enquanto lida com os limites morais do heroísmo.',    tags:{filme:1,pos2010:-1,acao:1,fantasia:-1,scifi:1,americano:1,poderes:-1,historico:-1,comedia:-1,adulto:-1,longo:1,oscar:1,adaptacao:1,franquia:1,vilao:1,finaltriste:1,romance:-1,animacao:-1,criancas:-1,espaco:-1,crime:1,guerra:-1,antiheroi:1,terror:-1,trilhafamosa:1,ante2000:-1,reviravolta:1,sobrevive:1,viagemtempo:-1,baseadofatos:-1,maisdeuma:1,anime:-1,superheroi:1,amizade:-1,naohuman:-1,classico:1,muitosprot:-1,posapoc:-1,protmulher:-1,danca:-1,mexico:-1,brasil:-1,japao:-1,infantil:-1,orfao:1,magia:-1,esporte:-1,musical:-1,policial:1,sobrenatural:-1,familia:-1,vinganca:-1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:-1,mitologia:-1}},
  {id:'t011',tmdb:278,   nome:'Um Sonho de Liberdade',           nomeOriginal:'The Shawshank Redemption',   tipo:'movie', raridade:'medio', capa:'https://image.tmdb.org/t/p/w500/lyQBXzOQSuE59IsHyhrp0qIiPAz.jpg', sinopse:'Andy Dufresne, banqueiro condenado injustamente por duplo homicídio, passa 19 anos na prisão de Shawshank fazendo amizade com Red enquanto planeja secretamente sua fuga.',                          tags:{filme:1,pos2010:-1,acao:-1,fantasia:-1,scifi:-1,americano:1,poderes:-1,historico:-1,comedia:-1,adulto:1,longo:1,oscar:1,adaptacao:1,franquia:-1,vilao:1,finaltriste:-1,romance:-1,animacao:-1,criancas:-1,espaco:-1,crime:1,guerra:-1,antiheroi:-1,terror:-1,trilhafamosa:1,ante2000:1,reviravolta:1,sobrevive:1,viagemtempo:-1,baseadofatos:-1,maisdeuma:-1,anime:-1,superheroi:-1,amizade:1,naohuman:-1,classico:1,muitosprot:-1,posapoc:-1,protmulher:-1,danca:-1,mexico:-1,brasil:-1,japao:-1,infantil:-1,orfao:-1,magia:-1,esporte:-1,musical:-1,policial:1,sobrenatural:-1,familia:-1,vinganca:-1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:-1,mitologia:-1}},
  {id:'t012',tmdb:27205, nome:'A Origem',                        nomeOriginal:'Inception',                  tipo:'movie', raridade:'medio', capa:'https://image.tmdb.org/t/p/w500/edv5CZvWj09paC4NZTiEXIk4hPX.jpg', sinopse:'Dom Cobb é um ladrão especialista em entrar nos sonhos das pessoas para roubar segredos. Ele recebe uma missão impossível: plantar uma ideia na mente de um alvo em vez de roubar.',                tags:{filme:1,pos2010:1,acao:1,fantasia:1,scifi:1,americano:1,poderes:-1,historico:-1,comedia:-1,adulto:-1,longo:1,oscar:1,adaptacao:-1,franquia:-1,vilao:1,finaltriste:1,romance:1,animacao:-1,criancas:-1,espaco:-1,crime:-1,guerra:-1,antiheroi:-1,terror:-1,trilhafamosa:1,ante2000:-1,reviravolta:1,sobrevive:1,viagemtempo:1,baseadofatos:-1,maisdeuma:-1,anime:-1,superheroi:-1,amizade:-1,naohuman:-1,classico:1,muitosprot:1,posapoc:-1,protmulher:-1,danca:-1,mexico:-1,brasil:-1,japao:-1,infantil:-1,orfao:-1,magia:-1,esporte:-1,musical:-1,policial:-1,sobrenatural:-1,familia:-1,vinganca:-1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:1,escola:-1,mitologia:-1}},
  {id:'t013',tmdb:13,    nome:'Forrest Gump',                    nomeOriginal:'Forrest Gump',               tipo:'movie', raridade:'comum', capa:'https://image.tmdb.org/t/p/w500/arw2vcBveWOVZr6pxd9XTd1TdQa.jpg', sinopse:'Forrest Gump, um homem simples do Alabama com QI abaixo da média, testemunha e participa de eventos históricos americanos como Vietnam e Watergate. Sua dedicação a Jenny atravessa décadas.',      tags:{filme:1,pos2010:-1,acao:-1,fantasia:-1,scifi:-1,americano:1,poderes:-1,historico:1,comedia:1,adulto:-1,longo:1,oscar:1,adaptacao:1,franquia:-1,vilao:-1,finaltriste:1,romance:1,animacao:-1,criancas:-1,espaco:-1,crime:-1,guerra:1,antiheroi:-1,terror:-1,trilhafamosa:1,ante2000:1,reviravolta:-1,sobrevive:1,viagemtempo:-1,baseadofatos:1,maisdeuma:-1,anime:-1,superheroi:-1,amizade:1,naohuman:-1,classico:1,muitosprot:-1,posapoc:-1,protmulher:-1,danca:-1,mexico:-1,brasil:-1,japao:-1,infantil:-1,orfao:-1,magia:-1,esporte:1,musical:-1,policial:-1,sobrenatural:-1,familia:1,vinganca:-1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:-1,mitologia:-1}},
  {id:'t014',tmdb:157336,nome:'Interestelar',                    nomeOriginal:'Interstellar',               tipo:'movie', raridade:'medio', capa:'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg', sinopse:'Cooper, ex-piloto da NASA, lidera uma expedição pelo buraco de minhoca de Saturno para encontrar um novo planeta habitável enquanto a Terra se aproxima da extinção por falta de alimentos.',        tags:{filme:1,pos2010:1,acao:-1,fantasia:-1,scifi:1,americano:1,poderes:-1,historico:-1,comedia:-1,adulto:-1,longo:1,oscar:1,adaptacao:-1,franquia:-1,vilao:-1,finaltriste:1,romance:1,animacao:-1,criancas:-1,espaco:1,crime:-1,guerra:-1,antiheroi:-1,terror:-1,trilhafamosa:1,ante2000:-1,reviravolta:1,sobrevive:1,viagemtempo:1,baseadofatos:-1,maisdeuma:-1,anime:-1,superheroi:-1,amizade:-1,naohuman:-1,classico:-1,muitosprot:-1,posapoc:-1,protmulher:-1,danca:-1,mexico:-1,brasil:-1,japao:-1,infantil:-1,orfao:-1,magia:-1,esporte:-1,musical:-1,policial:-1,sobrenatural:-1,familia:1,vinganca:-1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:-1,mitologia:-1}},
  {id:'t015',tmdb:372058,nome:'Seu Nome',                        nomeOriginal:'Kimi no Na wa',              tipo:'movie', raridade:'raro',  capa:'https://image.tmdb.org/t/p/w500/q719jXXEzOoYaps6babgKnONONX.jpg', sinopse:'Mitsuha, garota de cidade rural japonesa, e Taki, rapaz de Tóquio, trocam de corpo misteriosamente enquanto dormem. Eles começam a deixar mensagens um para o outro e se apaixonam.',          tags:{filme:1,pos2010:1,acao:-1,fantasia:1,scifi:-1,americano:-1,poderes:-1,historico:-1,comedia:-1,adulto:-1,longo:-1,oscar:-1,adaptacao:-1,franquia:-1,vilao:-1,finaltriste:1,romance:1,animacao:1,criancas:1,espaco:-1,crime:-1,guerra:-1,antiheroi:-1,terror:-1,trilhafamosa:1,ante2000:-1,reviravolta:1,sobrevive:1,viagemtempo:1,baseadofatos:-1,maisdeuma:-1,anime:1,superheroi:-1,amizade:-1,naohuman:-1,classico:1,muitosprot:-1,posapoc:-1,protmulher:1,danca:-1,mexico:-1,brasil:-1,japao:1,infantil:-1,orfao:-1,magia:1,esporte:-1,musical:-1,policial:-1,sobrenatural:1,familia:-1,vinganca:-1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:1,mitologia:-1}},
  {id:'t016',tmdb:598,   nome:'Cidade de Deus',                  nomeOriginal:'Cidade de Deus',             tipo:'movie', raridade:'medio', capa:'https://image.tmdb.org/t/p/w500/k7eYdWvhYQyRQoU2TB2A2Xu2grZ.jpg', sinopse:'Na favela Cidade de Deus no Rio de Janeiro, Buscapé documenta com sua câmera o crescimento do tráfico de drogas dos anos 60 até os 80, centrado no criminoso Zé Pequeno.',                  tags:{filme:1,pos2010:-1,acao:1,fantasia:-1,scifi:-1,americano:-1,poderes:-1,historico:1,comedia:-1,adulto:1,longo:-1,oscar:1,adaptacao:1,franquia:-1,vilao:1,finaltriste:1,romance:1,animacao:-1,criancas:1,espaco:-1,crime:1,guerra:-1,antiheroi:1,terror:-1,trilhafamosa:1,ante2000:-1,reviravolta:-1,sobrevive:-1,viagemtempo:-1,baseadofatos:1,maisdeuma:-1,anime:-1,superheroi:-1,amizade:1,naohuman:-1,classico:1,muitosprot:1,posapoc:-1,protmulher:-1,danca:-1,mexico:-1,brasil:1,japao:-1,infantil:-1,orfao:1,magia:-1,esporte:-1,musical:-1,policial:1,sobrenatural:-1,familia:-1,vinganca:1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:-1,mitologia:-1}},
  {id:'t017',tmdb:597,   nome:'Titanic',                         nomeOriginal:'Titanic',                    tipo:'movie', raridade:'comum', capa:'https://image.tmdb.org/t/p/w500/9xjZS2rlVxm8SFx8kPC3aIGCOYQ.jpg', sinopse:'Em 1912, a jovem aristocrata Rose e o artista pobre Jack se apaixonam no navio Titanic em sua viagem inaugural. Quando o navio colide com um iceberg, os dois lutam para sobreviver.',           tags:{filme:1,pos2010:-1,acao:-1,fantasia:-1,scifi:-1,americano:1,poderes:-1,historico:1,comedia:-1,adulto:-1,longo:1,oscar:1,adaptacao:-1,franquia:-1,vilao:-1,finaltriste:1,romance:1,animacao:-1,criancas:-1,espaco:-1,crime:-1,guerra:-1,antiheroi:-1,terror:-1,trilhafamosa:1,ante2000:1,reviravolta:-1,sobrevive:-1,viagemtempo:-1,baseadofatos:1,maisdeuma:-1,anime:-1,superheroi:-1,amizade:-1,naohuman:-1,classico:1,muitosprot:-1,posapoc:-1,protmulher:1,danca:-1,mexico:-1,brasil:-1,japao:-1,infantil:-1,orfao:-1,magia:-1,esporte:-1,musical:-1,policial:-1,sobrenatural:-1,familia:-1,vinganca:-1,survival:1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:-1,mitologia:-1}},
  {id:'t018',tmdb:129,   nome:'O Castelo Animado',               nomeOriginal:'Howls Moving Castle',       tipo:'movie', raridade:'raro',  capa:'https://image.tmdb.org/t/p/w500/mXT9BEkECMsKFsOFrHFdaXOFXiL.jpg', sinopse:'Sophie, jovem costureira amaldiçoada pela Bruxa das Baldas que a transforma em velha, busca ajuda no castelo ambulante do feiticeiro Howl. Studio Ghibli de Hayao Miyazaki.',                 tags:{filme:1,pos2010:-1,acao:-1,fantasia:1,scifi:-1,americano:-1,poderes:1,historico:1,comedia:1,adulto:-1,longo:-1,oscar:1,adaptacao:1,franquia:-1,vilao:1,finaltriste:-1,romance:1,animacao:1,criancas:1,espaco:-1,crime:-1,guerra:1,antiheroi:-1,terror:-1,trilhafamosa:1,ante2000:-1,reviravolta:1,sobrevive:1,viagemtempo:-1,baseadofatos:-1,maisdeuma:-1,anime:1,superheroi:-1,amizade:-1,naohuman:1,classico:1,muitosprot:-1,posapoc:-1,protmulher:1,danca:-1,mexico:-1,brasil:-1,japao:1,infantil:1,orfao:-1,magia:1,esporte:-1,musical:-1,policial:-1,sobrenatural:1,familia:-1,vinganca:-1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:-1,mitologia:-1}},
  {id:'t019',tmdb:76492, nome:'Miraculous: As Aventuras de Ladybug',nomeOriginal:'Miraculous Ladybug',     tipo:'tv',    raridade:'medio', capa:'https://image.tmdb.org/t/p/w500/dd2wnAOmMj0gRdQWpHeMSm2Kx2q.jpg', sinopse:'Marinette Dupain-Cheng é uma estudante parisiense que se transforma na super-heroína Ladybug para proteger Paris do vilão Papillon. Seu parceiro é Cat Noir, que ela não sabe ser Adrien.',     tags:{filme:-1,pos2010:1,acao:1,fantasia:1,scifi:-1,americano:-1,poderes:1,historico:-1,comedia:1,adulto:-1,longo:-1,oscar:-1,adaptacao:-1,franquia:1,vilao:1,finaltriste:-1,romance:1,animacao:1,criancas:1,espaco:-1,crime:-1,guerra:-1,antiheroi:-1,terror:-1,trilhafamosa:1,ante2000:-1,reviravolta:-1,sobrevive:1,viagemtempo:-1,baseadofatos:-1,maisdeuma:1,anime:-1,superheroi:1,amizade:1,naohuman:-1,classico:-1,muitosprot:-1,posapoc:-1,protmulher:1,danca:-1,mexico:-1,brasil:-1,japao:-1,infantil:1,orfao:-1,magia:1,esporte:-1,musical:-1,policial:-1,sobrenatural:-1,familia:-1,vinganca:-1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:1,mitologia:-1}},
  {id:'t020',tmdb:11,    nome:'Star Wars: Uma Nova Esperança',   nomeOriginal:'Star Wars: A New Hope',      tipo:'movie', raridade:'comum', capa:'https://image.tmdb.org/t/p/w500/6FfCtAuVAW8XJjZ7eWeLibRLWTw.jpg', sinopse:'Luke Skywalker, jovem fazendeiro de Tatooine, se junta à Aliança Rebelde com o Jedi Obi-Wan Kenobi e o contrabandista Han Solo para resgatar a Princesa Leia e destruir a Estrela da Morte.',  tags:{filme:1,pos2010:-1,acao:1,fantasia:1,scifi:1,americano:1,poderes:1,historico:-1,comedia:-1,adulto:-1,longo:-1,oscar:1,adaptacao:-1,franquia:1,vilao:1,finaltriste:-1,romance:-1,animacao:-1,criancas:1,espaco:1,crime:-1,guerra:1,antiheroi:-1,terror:-1,trilhafamosa:1,ante2000:1,reviravolta:1,sobrevive:1,viagemtempo:-1,baseadofatos:-1,maisdeuma:1,anime:-1,superheroi:-1,amizade:1,naohuman:1,classico:1,muitosprot:1,posapoc:-1,protmulher:-1,danca:-1,mexico:-1,brasil:-1,japao:-1,infantil:1,orfao:1,magia:1,esporte:-1,musical:-1,policial:-1,sobrenatural:-1,familia:-1,vinganca:-1,survival:-1,distopia:-1,robos:1,zumbi:-1,vampiro:-1,espiao:-1,escola:-1,mitologia:-1}},
  {id:'t021',tmdb:85552, nome:'Euphoria',                        nomeOriginal:'Euphoria',                   tipo:'tv',    raridade:'medio', capa:'https://image.tmdb.org/t/p/w500/3Q0hd3heuWwDWpwcDkhQOA6TYWI.jpg', sinopse:'Rue Bennett, adolescente viciada em drogas, narra a vida de seus amigos em East Highland enquanto lida com vício, trauma, identidade e relacionamentos tóxicos.',                               tags:{filme:-1,pos2010:1,acao:-1,fantasia:-1,scifi:-1,americano:1,poderes:-1,historico:-1,comedia:-1,adulto:1,longo:-1,oscar:1,adaptacao:-1,franquia:-1,vilao:-1,finaltriste:1,romance:1,animacao:-1,criancas:1,espaco:-1,crime:1,guerra:-1,antiheroi:-1,terror:-1,trilhafamosa:1,ante2000:-1,reviravolta:-1,sobrevive:-1,viagemtempo:-1,baseadofatos:-1,maisdeuma:1,anime:-1,superheroi:-1,amizade:1,naohuman:-1,classico:-1,muitosprot:1,posapoc:-1,protmulher:1,danca:-1,mexico:-1,brasil:-1,japao:-1,infantil:-1,orfao:-1,magia:-1,esporte:-1,musical:-1,policial:-1,sobrenatural:-1,familia:-1,vinganca:-1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:1,mitologia:-1}},
  {id:'t022',tmdb:22794, nome:'REC',                             nomeOriginal:'REC',                        tipo:'movie', raridade:'raro',  capa:'https://image.tmdb.org/t/p/w500/4b8wS8tWHMhSRUMvVzMvhgV8GJu.jpg', sinopse:'A repórter Ángela e seu câmera acompanham bombeiros numa ocorrência num prédio em Barcelona. Quando quarentena é decretada, ficam presos com moradores infectados por um vírus misterioso.',         tags:{filme:1,pos2010:-1,acao:1,fantasia:-1,scifi:-1,americano:-1,poderes:-1,historico:-1,comedia:-1,adulto:1,longo:-1,oscar:-1,adaptacao:-1,franquia:1,vilao:1,finaltriste:1,romance:-1,animacao:-1,criancas:-1,espaco:-1,crime:-1,guerra:-1,antiheroi:-1,terror:1,trilhafamosa:-1,ante2000:-1,reviravolta:1,sobrevive:-1,viagemtempo:-1,baseadofatos:-1,maisdeuma:1,anime:-1,superheroi:-1,amizade:-1,naohuman:1,classico:-1,muitosprot:-1,posapoc:-1,protmulher:1,danca:-1,mexico:-1,brasil:-1,japao:-1,infantil:-1,orfao:-1,magia:-1,esporte:-1,musical:-1,policial:-1,sobrenatural:1,familia:-1,vinganca:-1,survival:1,distopia:-1,robos:-1,zumbi:1,vampiro:-1,espiao:-1,escola:-1,mitologia:-1}},
  {id:'t023',tmdb:539,   nome:'O Exorcista',                     nomeOriginal:'The Exorcist',               tipo:'movie', raridade:'raro',  capa:'https://image.tmdb.org/t/p/w500/4Bph0hhnDH6dpc0SZIV522bLm4P.jpg', sinopse:'Regan MacNeil, menina de 12 anos, começa a demonstrar comportamentos perturbadores após brincar com um tabuleiro ouija. Sua mãe desesperada chama dois padres para realizar um exorcismo.',      tags:{filme:1,pos2010:-1,acao:-1,fantasia:1,scifi:-1,americano:1,poderes:1,historico:-1,comedia:-1,adulto:1,longo:-1,oscar:1,adaptacao:1,franquia:1,vilao:1,finaltriste:1,romance:-1,animacao:-1,criancas:1,espaco:-1,crime:-1,guerra:-1,antiheroi:-1,terror:1,trilhafamosa:1,ante2000:1,reviravolta:1,sobrevive:-1,viagemtempo:-1,baseadofatos:-1,maisdeuma:1,anime:-1,superheroi:-1,amizade:-1,naohuman:1,classico:1,muitosprot:-1,posapoc:-1,protmulher:1,danca:-1,mexico:-1,brasil:-1,japao:-1,infantil:-1,orfao:-1,magia:1,esporte:-1,musical:-1,policial:-1,sobrenatural:1,familia:1,vinganca:-1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:-1,mitologia:-1}},
  {id:'t024',tmdb:10515, nome:'Camp Rock',                       nomeOriginal:'Camp Rock',                  tipo:'movie', raridade:'raro',  capa:'https://image.tmdb.org/t/p/w500/dT6EYeNmSQQPqBRqOBjJXcI5pFc.jpg', sinopse:'Mitchie Torres consegue uma vaga no acampamento de música Camp Rock ao fingir que sua mãe é chef. Lá ela encontra o astro arrogante Shane Gray dos Connect 3 e descobre sua voz.',                tags:{filme:1,pos2010:-1,acao:-1,fantasia:-1,scifi:-1,americano:1,poderes:-1,historico:-1,comedia:1,adulto:-1,longo:-1,oscar:-1,adaptacao:-1,franquia:1,vilao:-1,finaltriste:-1,romance:1,animacao:-1,criancas:1,espaco:-1,crime:-1,guerra:-1,antiheroi:-1,terror:-1,trilhafamosa:1,ante2000:-1,reviravolta:-1,sobrevive:1,viagemtempo:-1,baseadofatos:-1,maisdeuma:1,anime:-1,superheroi:-1,amizade:1,naohuman:-1,classico:-1,muitosprot:-1,posapoc:-1,protmulher:1,danca:1,mexico:-1,brasil:-1,japao:-1,infantil:1,orfao:-1,magia:-1,esporte:-1,musical:1,policial:-1,sobrenatural:-1,familia:-1,vinganca:-1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:1,mitologia:-1}},
  {id:'t025',tmdb:2649,  nome:'A Bruxa de Blair',                nomeOriginal:'The Blair Witch Project',    tipo:'movie', raridade:'raro',  capa:'https://image.tmdb.org/t/p/w500/9z0C4j4NEJ4bEfVaJXSHgHAMhbZ.jpg', sinopse:'Três estudantes de cinema entram na floresta de Burkittsville para documentar a lenda da Bruxa de Blair. No terceiro dia, desaparecem. Um ano depois, suas filmagens são encontradas.',            tags:{filme:1,pos2010:-1,acao:-1,fantasia:-1,scifi:-1,americano:1,poderes:-1,historico:-1,comedia:-1,adulto:1,longo:-1,oscar:-1,adaptacao:-1,franquia:1,vilao:1,finaltriste:1,romance:-1,animacao:-1,criancas:-1,espaco:-1,crime:-1,guerra:-1,antiheroi:-1,terror:1,trilhafamosa:-1,ante2000:1,reviravolta:1,sobrevive:-1,viagemtempo:-1,baseadofatos:-1,maisdeuma:1,anime:-1,superheroi:-1,amizade:-1,naohuman:1,classico:1,muitosprot:-1,posapoc:-1,protmulher:1,danca:-1,mexico:-1,brasil:-1,japao:-1,infantil:-1,orfao:-1,magia:1,esporte:-1,musical:-1,policial:-1,sobrenatural:1,familia:-1,vinganca:-1,survival:1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:-1,mitologia:-1}}
];

const PERGUNTAS_FIXAS = [
  {id:'filme',txt:'É um filme (não uma série)?'},
  {id:'animacao',txt:'É animação (desenho)?'},
  {id:'anime',txt:'É anime japonês?'},
  {id:'pos2010',txt:'Foi lançado depois de 2010?'},
  {id:'ante2000',txt:'Foi lançado antes do ano 2000?'},
  {id:'americano',txt:'É produção americana?'},
  {id:'japao',txt:'É japonês ou se passa no Japão?'},
  {id:'brasil',txt:'É brasileiro ou se passa no Brasil?'},
  {id:'mexico',txt:'É mexicano ou se passa no México?'},
  {id:'adulto',txt:'É voltado para adultos?'},
  {id:'infantil',txt:'É voltado para crianças?'},
  {id:'criancas',txt:'Os protagonistas são crianças ou adolescentes?'},
  {id:'acao',txt:'É de ação ou aventura?'},
  {id:'terror',txt:'É terror ou suspense?'},
  {id:'comedia',txt:'É comédia com muito humor?'},
  {id:'romance',txt:'O romance é parte importante?'},
  {id:'scifi',txt:'Tem ficção científica?'},
  {id:'fantasia',txt:'Tem elementos de fantasia?'},
  {id:'crime',txt:'Envolve crime ou mundo criminoso?'},
  {id:'guerra',txt:'Tem cenas de guerra?'},
  {id:'poderes',txt:'O protagonista tem poderes especiais?'},
  {id:'superheroi',txt:'Tem super-heróis com traje ou fantasia?'},
  {id:'magia',txt:'Tem magia ou feitiçaria?'},
  {id:'vilao',txt:'Tem um vilão muito marcante?'},
  {id:'maisdeuma',txt:'Tem mais de uma temporada ou sequência?'},
  {id:'franquia',txt:'Faz parte de uma franquia famosa?'},
  {id:'classico',txt:'É considerado um grande clássico?'},
  {id:'oscar',txt:'Ganhou ou foi indicado ao Oscar?'},
  {id:'longo',txt:'Dura mais de 2 horas?'},
  {id:'espaco',txt:'A história acontece no espaço?'},
  {id:'sobrenatural',txt:'Tem elementos sobrenaturais?'},
  {id:'naohuman',txt:'Tem personagens não-humanos importantes?'},
  {id:'muitosprot',txt:'Tem vários protagonistas principais?'},
  {id:'protmulher',txt:'A protagonista principal é mulher?'},
  {id:'antiheroi',txt:'O protagonista é um anti-herói?'},
  {id:'orfao',txt:'O protagonista é órfão ou perdeu os pais?'},
  {id:'familia',txt:'A família é tema central?'},
  {id:'amizade',txt:'A amizade é tema central?'},
  {id:'finaltriste',txt:'O final é triste ou ambíguo?'},
  {id:'reviravolta',txt:'Tem uma reviravolta surpreendente?'},
  {id:'sobrevive',txt:'O protagonista sobrevive até o final?'},
  {id:'viagemtempo',txt:'Envolve viagem no tempo?'},
  {id:'baseadofatos',txt:'É baseado em fatos reais?'},
  {id:'historico',txt:'A história se passa no passado?'},
  {id:'distopia',txt:'É distopia (futuro opressivo)?'},
  {id:'posapoc',txt:'O mundo é pós-apocalíptico?'},
  {id:'robos',txt:'Tem robôs ou inteligência artificial?'},
  {id:'zumbi',txt:'Tem zumbis?'},
  {id:'vampiro',txt:'Tem vampiros?'},
  {id:'espiao',txt:'Tem espiões ou agentes secretos?'},
  {id:'musical',txt:'É um musical com personagens cantando?'},
  {id:'danca',txt:'Tem cenas de dança importantes?'},
  {id:'esporte',txt:'O esporte é tema importante?'},
  {id:'policial',txt:'Tem investigação policial?'},
  {id:'trilhafamosa',txt:'Tem trilha sonora muito famosa?'},
  {id:'escola',txt:'Se passa principalmente numa escola?'},
  {id:'mitologia',txt:'Envolve mitologia grega, nórdica ou similar?'},
  {id:'survival',txt:'Envolve sobrevivência extrema?'},
  {id:'vinganca',txt:'A vingança é motivação principal?'},
  {id:'adaptacao',txt:'É baseado em livro, quadrinho ou jogo?'},
];

// ============================================================
// INIT
// ============================================================
function initTitulos() {
  const d = lerTitulos();
  if (d.titulos.length === 0) {
    d.titulos = TITULOS_INICIAIS;
    salvarTitulos(d);
    console.log('Banco inicial:', TITULOS_INICIAIS.length, 'títulos');
  }
}

// ============================================================
// AUTH
// ============================================================
app.post('/api/login', (req, res) => {
  const { username } = req.body;
  if (!username) return res.json({ erro: 'Digite um apelido!' });
  const db = lerDB();
  const user = db.usuarios.find(u => u.username === username);
  if (!user) return res.json({ erro: 'Usuário não encontrado. Crie uma conta!' });
  res.json({ sucesso: true, usuario: user });
});

app.post('/api/cadastro', (req, res) => {
  const { username, senha, avatarIdx } = req.body;
  if (!username) return res.json({ erro: 'Digite um apelido!' });
  if (!senha || senha.length !== 4) return res.json({ erro: 'Senha deve ter 4 dígitos!' });
  const db = lerDB();
  if (db.usuarios.find(u => u.username === username)) return res.json({ erro: 'Apelido já existe!' });
  const user = { id: uuidv4(), username, senha, avatarIdx: avatarIdx || 0, pontos: 0, jogos: 0, acertos: 0, criado: new Date().toISOString() };
  db.usuarios.push(user);
  salvarDB(db);
  res.json({ sucesso: true, usuario: user });
});

// ============================================================
// TÍTULOS E PERGUNTAS
// ============================================================
app.get('/api/titulos', (req, res) => {
  const d = lerTitulos();
  res.json({ titulos: d.titulos, total: d.titulos.length });
});

app.get('/api/perguntas', (req, res) => {
  const dinamicas = lerPergs();
  const idsFixas = new Set(PERGUNTAS_FIXAS.map(p => p.id));
  const extras = (dinamicas.perguntas || []).filter(p => !idsFixas.has(p.id));
  res.json([...PERGUNTAS_FIXAS, ...extras]);
});

app.get('/api/perguntas-dinamicas', (req, res) => {
  const d = lerPergs();
  res.json({ total: (d.perguntas || []).length, perguntas: d.perguntas || [] });
});

// ============================================================
// RESULTADO DO JOGO
// ============================================================
app.post('/api/resultado', (req, res) => {
  const { username, tituloId, nome, raridade, pontos, capa, acertou } = req.body;
  const db = lerDB();
  const user = db.usuarios.find(u => u.username === username);
  if (user) {
    user.pontos = (user.pontos || 0) + pontos;
    user.jogos = (user.jogos || 0) + 1;
    if (acertou) user.acertos = (user.acertos || 0) + 1;
  }
  let entry = db.resultados.find(r => r.tituloId === tituloId);
  if (!entry) { entry = { tituloId, nome, raridade, jogos: 0, acertos: 0, capa: capa || '' }; db.resultados.push(entry); }
  entry.jogos++;
  if (acertou) entry.acertos++;
  if (capa && !entry.capa) entry.capa = capa;
  salvarDB(db);
  res.json({ sucesso: true });
});

// ============================================================
// SUGERIR TÍTULO — quando jogador clica "Errou"
// ============================================================
app.post('/api/sugerir', async (req, res) => {
  const { nome, username } = req.body;
  if (!nome || nome.trim().length < 2) return res.json({ erro: 'Nome inválido!' });

  // Responde imediatamente ao cliente
  res.json({ sucesso: true, msg: `"${nome}" recebido! Processando...` });

  // Processa em background após responder
  setImmediate(async () => {
    try {
      const titulos = lerTitulos();
      // Verifica duplicata por nome (case insensitive)
      if (titulos.titulos.find(t => t.nome.toLowerCase() === nome.toLowerCase().trim())) {
        console.log('Já existe no banco:', nome);
        return;
      }
      const fila = lerFila();
      if (fila.pendentes.find(p => p.nome.toLowerCase() === nome.toLowerCase().trim())) {
        console.log('Já na fila:', nome);
        return;
      }
      fila.pendentes.push({ id: uuidv4(), nome: nome.trim(), sugeridoPor: username || 'anon', data: new Date().toISOString() });
      salvarFila(fila);
      await processarTitulo(nome.trim());
    } catch(e) {
      console.error('Erro sugestão background:', e.message);
    }
  });
});

app.get('/api/fila', (req, res) => {
  const f = lerFila();
  res.json({ pendentes: f.pendentes.length, processados: f.processados.slice(-20) });
});

// ============================================================
// PROCESSAR TÍTULO — TMDB + sinopse completa + tags + perguntas
// ============================================================
async function processarTitulo(nome) {
  console.log('🔄 Processando:', nome);
  try {
    // Busca no TMDB
    const busca = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}&query=${encodeURIComponent(nome)}&language=pt-BR`);
    const bd = await busca.json();
    if (!bd.results || bd.results.length === 0) {
      console.log('Não encontrado no TMDB:', nome);
      return;
    }

    const r = bd.results[0];
    const tipo = r.media_type === 'movie' ? 'movie' : 'tv';
    const tmdbId = r.id;

    // Verifica se já existe
    const titulos = lerTitulos();
    if (titulos.titulos.find(t => t.tmdb === tmdbId)) {
      console.log('Já existe (tmdb):', tmdbId);
      // Remove da fila mesmo assim
      const fila = lerFila();
      fila.pendentes = fila.pendentes.filter(p => p.nome.toLowerCase() !== nome.toLowerCase());
      salvarFila(fila);
      return;
    }

    // Busca detalhes COMPLETOS em pt-BR para sinopse rica
    let nomePT = r.title || r.name || nome;
    let nomeOriginal = r.original_title || r.original_name || nome;
    let sinopse = r.overview || '';
    let generos = r.genre_ids || [];
    let capa = r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : '';

    try {
      const detUrl = `https://api.themoviedb.org/3/${tipo}/${tmdbId}?api_key=${TMDB_KEY}&language=pt-BR&append_to_response=credits`;
      const det = await fetch(detUrl);
      const dd = await det.json();
      if (dd.title || dd.name) nomePT = dd.title || dd.name;
      if (dd.overview && dd.overview.length > sinopse.length) sinopse = dd.overview;
      if (dd.genres) generos = dd.genres.map(g => g.id);
      if (dd.poster_path) capa = `https://image.tmdb.org/t/p/w500${dd.poster_path}`;
    } catch(e) {}

    const ano = (r.release_date || r.first_air_date || '2000').slice(0, 4);
    const pop = r.popularity || 0;
    const raridade = pop > 50 ? 'comum' : pop > 10 ? 'medio' : 'raro';

    // Gera tags baseadas em gênero + IA
    const tags = await gerarTagsIA(nomePT, sinopse, generos, tipo, ano);

    // Salva no banco
    const novoTitulo = {
      id: 't' + Date.now(),
      tmdb: tmdbId,
      nome: nomePT,
      nomeOriginal,
      tipo, raridade, capa, sinopse, tags
    };
    titulos.titulos.push(novoTitulo);
    salvarTitulos(titulos);
    console.log('✅ Adicionado:', nomePT, '| Total:', titulos.titulos.length);

    // Gera perguntas específicas imediatamente
    if (OR_KEY && sinopse) {
      gerarPerguntasEspecificas(nomePT, sinopse, tags).catch(e => console.log('Pergs err:', e.message));
    }

    // Remove da fila
    const fila = lerFila();
    fila.pendentes = fila.pendentes.filter(p => p.nome.toLowerCase() !== nome.toLowerCase());
    fila.processados.push({ nome: nomePT, data: new Date().toISOString() });
    if (fila.processados.length > 200) fila.processados = fila.processados.slice(-200);
    salvarFila(fila);

  } catch(e) {
    console.error('❌ Erro processando:', nome, '|', e.message);
  }
}

// ============================================================
// TAGS AUTOMÁTICAS POR GÊNERO TMDB
// ============================================================
async function gerarTagsIA(nome, sinopse, generos, tipo, ano) {
  const tags = {};
  PERGUNTAS_FIXAS.forEach(p => { tags[p.id] = 0; });

  // Tags por gênero TMDB
  if (generos.includes(28) || generos.includes(12)) tags.acao = 1;
  if (generos.includes(14)) { tags.fantasia = 1; tags.magia = 1; }
  if (generos.includes(878)) tags.scifi = 1;
  if (generos.includes(35)) tags.comedia = 1;
  if (generos.includes(27)) { tags.terror = 1; tags.sobrenatural = 1; }
  if (generos.includes(10749)) tags.romance = 1;
  if (generos.includes(16)) { tags.animacao = 1; tags.infantil = 1; }
  if (generos.includes(10402)) { tags.musical = 1; tags.danca = 1; }
  if (generos.includes(80)) { tags.crime = 1; tags.policial = 1; }
  if (generos.includes(10752)) tags.guerra = 1;
  if (generos.includes(99)) tags.baseadofatos = 1;
  if (generos.includes(36)) tags.historico = 1;
  if (generos.includes(9648)) tags.reviravolta = 1;
  if (generos.includes(53)) tags.terror = 1;
  if (generos.includes(10765)) { tags.fantasia = 1; tags.scifi = 1; }
  if (generos.includes(10762)) tags.infantil = 1;
  if (generos.includes(10759)) tags.acao = 1;

  tags.filme = tipo === 'movie' ? 1 : -1;
  tags.pos2010 = parseInt(ano) >= 2010 ? 1 : -1;
  tags.ante2000 = parseInt(ano) < 2000 ? 1 : -1;

  // Melhora tags com OpenRouter se disponível
  if (OR_KEY && sinopse) {
    try {
      const prompt = `Você analisa títulos para um jogo de adivinhação. 
Título: "${nome}" (${tipo === 'movie' ? 'Filme' : 'Série'}, ${ano})
Sinopse: ${sinopse}

Responda SOMENTE com JSON válido, sem texto extra. Use 1=sim, -1=não, 0=incerto:
{"poderes":0,"vilao":0,"finaltriste":0,"criancas":0,"espaco":0,"antiheroi":0,"trilhafamosa":0,"reviravolta":0,"sobrevive":0,"viagemtempo":0,"maisdeuma":0,"anime":0,"superheroi":0,"amizade":0,"naohuman":0,"classico":0,"muitosprot":0,"posapoc":0,"protmulher":0,"danca":0,"mexico":0,"brasil":0,"japao":0,"americano":0,"infantil":0,"orfao":0,"esporte":0,"policial":0,"familia":0,"vinganca":0,"survival":0,"distopia":0,"robos":0,"zumbi":0,"vampiro":0,"espiao":0,"escola":0,"mitologia":0,"oscar":0,"longo":0,"adaptacao":0,"franquia":0,"baseadofatos":0,"historico":0}`;

      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OR_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://darkinatror.up.railway.app'
        },
        body: JSON.stringify({ model: OR_MODEL, max_tokens: 500, messages: [{ role: 'user', content: prompt }] })
      });
      const rd = await resp.json();
      const txt = rd.choices?.[0]?.message?.content || '';
      const match = txt.match(/\{[\s\S]*\}/);
      if (match) {
        const iaTags = JSON.parse(match[0]);
        Object.assign(tags, iaTags);
      }
    } catch(e) { console.log('OpenRouter tags falhou:', e.message); }
  }
  return tags;
}

// ============================================================
// PERGUNTAS ESPECÍFICAS POR TÍTULO
// ============================================================
async function gerarPerguntasEspecificas(nome, sinopse, tagsExistentes) {
  if (!OR_KEY) return;
  try {
    const tagsAtivas = Object.entries(tagsExistentes || {}).filter(([,v]) => v === 1).map(([k]) => k).join(', ');
    const prompt = `Você cria perguntas para um jogo de adivinhação de filmes/séries (estilo Akinator).

Título: "${nome}"
Sinopse: ${sinopse}
Características conhecidas: ${tagsAtivas}

Crie 6 perguntas SIM/NÃO muito específicas que ajudariam a identificar APENAS este título.
Foque em: objetos icônicos, personagens únicos, locais específicos, elementos visuais, características únicas.

Responda SOMENTE com JSON array válido:
[
  {"id":"snake_case_sem_acento","txt":"Pergunta clara em português?","resposta":1},
  {"id":"snake_case_sem_acento","txt":"Pergunta clara em português?","resposta":1}
]

Regras:
- id: apenas letras minúsculas, números e underscore
- txt: pergunta clara terminando com ?
- resposta: 1 se o título responde SIM, -1 se NÃO
- Seja criativo e específico!`;

    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OR_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://darkinatror.up.railway.app'
      },
      body: JSON.stringify({ model: OR_MODEL, max_tokens: 700, messages: [{ role: 'user', content: prompt }] })
    });
    const rd = await resp.json();
    const txt = rd.choices?.[0]?.message?.content || '';
    const match = txt.match(/\[[\s\S]*\]/);
    if (!match) return;

    const novas = JSON.parse(match[0]);
    if (!Array.isArray(novas) || novas.length === 0) return;

    const pergs = lerPergs();
    const idsExistentes = new Set([
      ...PERGUNTAS_FIXAS.map(p => p.id),
      ...(pergs.perguntas || []).map(p => p.id)
    ]);

    let adicionadas = 0;
    for (const p of novas) {
      if (!p.id || !p.txt) continue;
      if (!/^[a-z0-9_]+$/.test(p.id)) continue;
      if (idsExistentes.has(p.id)) continue;
      pergs.perguntas.push({
        id: p.id,
        txt: p.txt,
        titulo: nome,
        resposta: p.resposta || 1,
        geradoEm: new Date().toISOString()
      });
      idsExistentes.add(p.id);
      adicionadas++;
    }

    if (adicionadas > 0) {
      salvarPergs(pergs);
      console.log(`💬 ${adicionadas} perguntas novas para: ${nome}`);

      // Adiciona as tags das novas perguntas ao título
      const titulos = lerTitulos();
      const titulo = titulos.titulos.find(t => t.nome === nome);
      if (titulo) {
        for (const p of novas) {
          if (p.id && /^[a-z0-9_]+$/.test(p.id)) {
            titulo.tags[p.id] = p.resposta || 1;
          }
        }
        salvarTitulos(titulos);
      }
    }
  } catch(e) { console.log('Erro perguntas específicas:', e.message); }
}

// ============================================================
// GERAÇÃO EM LOTE — 100 perguntas a cada 6h
// ============================================================
let geracaoRodando = false;
async function gerarPerguntasEmLote() {
  if (!OR_KEY || geracaoRodando) return;
  geracaoRodando = true;
  const pergs = lerPergs();
  const hoje = new Date().toDateString();
  if (pergs.ultimaGeracao === hoje) { geracaoRodando = false; return; }

  console.log('💬 Gerando perguntas em lote...');
  const titulos = lerTitulos();
  const amostra = [...titulos.titulos].sort(() => Math.random() - 0.5).slice(0, 16);
  let total = 0;

  for (const t of amostra) {
    if (total >= 96) break;
    if (!t.sinopse) continue;
    try {
      await gerarPerguntasEspecificas(t.nome, t.sinopse, t.tags || {});
      total += 6;
      await new Promise(r => setTimeout(r, 2000));
    } catch(e) {}
  }

  pergs.ultimaGeracao = hoje;
  salvarPergs(pergs);
  geracaoRodando = false;
  console.log('💬 Lote ok. Total perguntas dinâmicas:', lerPergs().perguntas.length);
}

// ============================================================
// MÚSICA — Deezer com sistema de score inteligente
// ============================================================
app.get('/api/musica', async (req, res) => {
  const nomePT = req.query.q || '';
  const nomeOrig = req.query.original || nomePT;
  if (!nomePT) return res.json({ erro: 'Informe q' });

  function scoreFaixa(track, nomeRef) {
    let s = 0;
    const titulo = (track.title || '').toLowerCase();
    const album = (track.album?.title || '').toLowerCase();
    const ref = nomeRef.toLowerCase();
    if (titulo.includes(ref)) s += 100;
    if (album.includes(ref)) s += 80;
    if (titulo.includes('theme')) s += 40;
    if (titulo.includes('opening')) s += 35;
    if (titulo.includes('soundtrack') || titulo.includes('ost')) s += 30;
    if (titulo.includes('main title')) s += 25;
    if (titulo.includes('cover') || titulo.includes('remix') || titulo.includes('karaoke')) s -= 60;
    if (track.preview) s += 15;
    return s;
  }

  const tentativas = [
    { q: `${nomeOrig} theme`,    ref: nomeOrig },
    { q: `${nomeOrig} opening`,  ref: nomeOrig },
    { q: `${nomeOrig} ost`,      ref: nomeOrig },
    { q: `${nomePT} trilha sonora`, ref: nomePT },
    { q: `${nomeOrig} soundtrack`,  ref: nomeOrig },
    { q: nomeOrig,               ref: nomeOrig },
  ];

  let melhor = null, melhorScore = -999;

  for (const { q, ref } of tentativas) {
    try {
      const r = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=10`);
      const d = await r.json();
      for (const track of (d.data || [])) {
        if (!track.preview) continue;
        const s = scoreFaixa(track, ref);
        if (s > melhorScore) { melhorScore = s; melhor = track; }
      }
      if (melhorScore >= 80) break; // achou match de alta qualidade
    } catch(e) { continue; }
  }

  if (!melhor || melhorScore < -10) return res.json({ erro: 'Trilha não encontrada' });

  res.json({
    titulo: melhor.title,
    artista: melhor.artist?.name || '',
    preview: melhor.preview,
    capa: melhor.album?.cover_medium || melhor.album?.cover_small || ''
  });
});

// ============================================================
// EXPANSÃO AUTOMÁTICA — 250 títulos por dia
// ============================================================
let expansaoRodando = false;
async function expandirBanco() {
  if (expansaoRodando) return;
  expansaoRodando = true;
  const titulos = lerTitulos();
  const hoje = new Date().toDateString();
  if (titulos.ultimaExpansao === hoje && (titulos.expansaoHoje || 0) >= 250) {
    expansaoRodando = false; return;
  }
  if (titulos.ultimaExpansao !== hoje) {
    titulos.expansaoHoje = 0;
    titulos.ultimaExpansao = hoje;
    salvarTitulos(titulos);
  }
  console.log('🔄 Expandindo banco... Total atual:', titulos.titulos.length);

  const p = Math.floor(Math.random() * 15) + 1;
  const urls = [
    `https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_KEY}&language=pt-BR&page=${p}`,
    `https://api.themoviedb.org/3/tv/popular?api_key=${TMDB_KEY}&language=pt-BR&page=${p}`,
    `https://api.themoviedb.org/3/movie/top_rated?api_key=${TMDB_KEY}&language=pt-BR&page=${p}`,
    `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&with_genres=16&language=pt-BR&page=${Math.ceil(Math.random()*10)}`,
    `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_KEY}&with_original_language=ja&language=pt-BR&page=${Math.ceil(Math.random()*10)}`,
    `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&with_genres=27&language=pt-BR&page=${Math.ceil(Math.random()*10)}`,
    `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_KEY}&with_genres=10762&language=pt-BR&page=${Math.ceil(Math.random()*5)}`,
  ];

  for (const url of urls) {
    const t2 = lerTitulos();
    if ((t2.expansaoHoje || 0) >= 250) break;
    try {
      const r = await fetch(url);
      const d = await r.json();
      for (const item of (d.results || []).slice(0, 6)) {
        const t3 = lerTitulos();
        if ((t3.expansaoHoje || 0) >= 250) break;
        // Filtra idioma e popularidade mínima
        const idiomaOk = ['pt', 'en', 'es', 'ja'].includes(item.original_language);
        const popOk = (item.popularity || 0) >= 8;
        if (!idiomaOk || !popOk) continue;
        if (t3.titulos.find(x => x.tmdb === item.id)) continue;
        await processarTitulo(item.title || item.name);
        const t4 = lerTitulos();
        t4.expansaoHoje = (t4.expansaoHoje || 0) + 1;
        salvarTitulos(t4);
        await new Promise(r => setTimeout(r, 1200));
      }
    } catch(e) { console.error('Expansão erro:', e.message); }
  }
  expansaoRodando = false;
  console.log('✅ Expansão ok. Total:', lerTitulos().titulos.length);
}

// ============================================================
// COMENTÁRIOS
// ============================================================
app.get('/api/comentarios/:tituloId', (req, res) => {
  const db = lerDB();
  res.json((db.comentarios || []).filter(c => c.tituloId === req.params.tituloId).slice(-30));
});

app.post('/api/comentario', (req, res) => {
  const { username, avatarIdx, tituloId, texto } = req.body;
  if (!texto || texto.trim().length < 1) return res.json({ erro: 'Texto vazio' });
  const db = lerDB();
  if (!db.comentarios) db.comentarios = [];
  const com = { id: uuidv4(), username, avatarIdx: avatarIdx || 0, tituloId, texto: texto.trim(), data: new Date().toISOString() };
  db.comentarios.push(com);
  if (db.comentarios.length > 10000) db.comentarios = db.comentarios.slice(-10000);
  salvarDB(db);
  res.json({ sucesso: true, comentario: com });
});

// ============================================================
// RANKING E TOP
// ============================================================
app.get('/api/ranking', (req, res) => {
  const db = lerDB();
  res.json([...db.usuarios].sort((a, b) => (b.pontos || 0) - (a.pontos || 0)).slice(0, 20).map(u => { const { senha, ...r } = u; return r; }));
});

app.get('/api/maisJogados', (req, res) => {
  const db = lerDB();
  res.json([...(db.resultados || [])].sort((a, b) => (b.jogos || 0) - (a.jogos || 0)).slice(0, 10));
});

app.get('/api/info', (req, res) => {
  const t = lerTitulos();
  const f = lerFila();
  const p = lerPergs();
  res.json({
    totalTitulos: t.titulos.length,
    totalPerguntas: PERGUNTAS_FIXAS.length + (p.perguntas || []).length,
    perguntasDinamicas: (p.perguntas || []).length,
    filaProcessando: f.pendentes.length,
    versao: '4.0'
  });
});

// ============================================================
// START
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔮 DarkiNator v4 porta ${PORT}`);
  initTitulos();
  setTimeout(() => expandirBanco(), 20000);
  setInterval(() => expandirBanco(), 6 * 60 * 60 * 1000);
  setTimeout(() => gerarPerguntasEmLote(), 35 * 60 * 1000);
  setInterval(() => gerarPerguntasEmLote(), 6 * 60 * 60 * 1000);
});
