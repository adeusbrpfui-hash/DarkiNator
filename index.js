const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
// Tenta node-fetch, senão usa https nativo do Node
let fetch;
try {
  fetch = require('node-fetch');
  if (typeof fetch !== 'function') throw new Error('not a function');
} catch(e) {
  console.log('node-fetch indisponível, usando https nativo');
  const https = require('https');
  const http = require('http');
  fetch = (url, opts={}) => new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const options = { method: opts.method||'GET', headers: opts.headers||{} };
    const req = lib.request(url, options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          json: () => Promise.resolve(JSON.parse(data)),
          text: () => Promise.resolve(data)
        });
      });
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

const DATA_DIR = fs.existsSync('/data') ? '/data' : __dirname;
const DB_PATH = path.join(DATA_DIR, 'db.json');
const TITULOS_PATH = path.join(DATA_DIR, 'titulos.json');
const FILA_PATH = path.join(DATA_DIR, 'fila.json');
const PERGS_PATH = path.join(DATA_DIR, 'perguntas_dinamicas.json');

const TMDB_KEY = process.env.TMDB_KEY || '8265bd1679663a7ea12ac168da84d2e8';
const OR_KEY = process.env.OPENROUTER_KEY || '';
const OR_MODEL = 'google/gemini-2.0-flash-exp:free';

function lerJSON(p, def) {
  try { if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8')); } catch {}
  return def;
}
function salvarJSON(p, d) {
  try { fs.writeFileSync(p, JSON.stringify(d, null, 2)); } catch(e) { console.error(e.message); }
}
function lerDB() { return lerJSON(DB_PATH, { usuarios:[], resultados:[], comentarios:[] }); }
function salvarDB(d) { salvarJSON(DB_PATH, d); }
function lerTitulos() { return lerJSON(TITULOS_PATH, { titulos:[], expansaoHoje:0, ultimaExpansao:'' }); }
function salvarTitulos(d) { salvarJSON(TITULOS_PATH, d); }
function lerFila() { return lerJSON(FILA_PATH, { pendentes:[], processados:[] }); }
function salvarFila(d) { salvarJSON(FILA_PATH, d); }
function lerPergsD() { return lerJSON(PERGS_PATH, { perguntas:[], ultimaGeracao:'' }); }
function salvarPergsD(d) { salvarJSON(PERGS_PATH, d); }

const TITULOS_INICIAIS = [
  {id:'t001',tmdb:217,nome:'Chaves',tipo:'tv',raridade:'comum',yt:'jNZWkAkR5cE',capa:'https://image.tmdb.org/t/p/w500/iODFGNDmuUFWBQBiuKcGsVbMCdN.jpg',sinopse:'Série cômica mexicana sobre um menino órfão que mora num barril.',tags:{filme:-1,pos2010:-1,acao:-1,fantasia:-1,scifi:-1,americano:-1,poderes:-1,historico:-1,comedia:1,adulto:-1,longo:-1,oscar:-1,adaptacao:-1,franquia:1,vilao:1,finaltriste:-1,romance:-1,animacao:-1,criancas:1,espaco:-1,crime:-1,guerra:-1,antiheroi:-1,terror:-1,trilhafamosa:1,ante2000:1,reviravolta:-1,sobrevive:1,viagemtempo:-1,baseadofatos:-1,maisdeuma:1,anime:-1,superheroi:-1,amizade:1,naohuman:-1,classico:1,muitosprot:1,posapoc:-1,protmulher:-1,danca:-1,mexico:1,brasil:-1,japao:-1,infantil:1,orfao:1,magia:-1,esporte:-1,musical:-1,policial:-1,sobrenatural:-1,familia:1,vinganca:-1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:1,mitologia:-1}},
  {id:'t002',tmdb:1425,nome:'Winx Club',tipo:'tv',raridade:'medio',yt:'V0PNzGwXGlI',capa:'https://image.tmdb.org/t/p/w500/mTOuB5UMF2oVGbdHGSCFEqDlqpP.jpg',sinopse:'Fadas adolescentes que estudam numa escola de magia e protegem o universo.',tags:{filme:-1,pos2010:-1,acao:1,fantasia:1,scifi:-1,americano:-1,poderes:1,historico:-1,comedia:-1,adulto:-1,longo:-1,oscar:-1,adaptacao:-1,franquia:1,vilao:1,finaltriste:-1,romance:1,animacao:1,criancas:1,espaco:-1,crime:-1,guerra:-1,antiheroi:-1,terror:-1,trilhafamosa:1,ante2000:-1,reviravolta:-1,sobrevive:1,viagemtempo:-1,baseadofatos:-1,maisdeuma:1,anime:-1,superheroi:1,amizade:1,naohuman:-1,classico:-1,muitosprot:1,posapoc:-1,protmulher:1,danca:-1,mexico:-1,brasil:-1,japao:-1,infantil:1,orfao:-1,magia:1,esporte:-1,musical:-1,policial:-1,sobrenatural:1,familia:-1,vinganca:-1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:1,mitologia:-1}},
  {id:'t003',tmdb:12171,nome:'Dragon Ball Z',tipo:'tv',raridade:'comum',yt:'2cJDwIaGKZ0',capa:'https://image.tmdb.org/t/p/w500/oSJaWvxDpnMXEpKFJBTzDHxn6uw.jpg',sinopse:'Goku e seus amigos defendem a Terra de vilões cada vez mais poderosos.',tags:{filme:-1,pos2010:-1,acao:1,fantasia:1,scifi:-1,americano:-1,poderes:1,historico:-1,comedia:-1,adulto:-1,longo:-1,oscar:-1,adaptacao:1,franquia:1,vilao:1,finaltriste:-1,romance:-1,animacao:1,criancas:1,espaco:1,crime:-1,guerra:1,antiheroi:-1,terror:-1,trilhafamosa:1,ante2000:1,reviravolta:1,sobrevive:1,viagemtempo:1,baseadofatos:-1,maisdeuma:1,anime:1,superheroi:1,amizade:1,naohuman:1,classico:1,muitosprot:1,posapoc:-1,protmulher:-1,danca:-1,mexico:-1,brasil:-1,japao:1,infantil:1,orfao:-1,magia:-1,esporte:-1,musical:-1,policial:-1,sobrenatural:-1,familia:1,vinganca:-1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:-1,mitologia:-1}},
  {id:'t004',tmdb:46260,nome:'Attack on Titan',tipo:'tv',raridade:'medio',yt:'MGRm4IzK1SQ',capa:'https://image.tmdb.org/t/p/w500/hTP1DtLGFAmAn92954tFmkgAToe.jpg',sinopse:'Humanidade luta pela sobrevivência contra titãs gigantes atrás de muros.',tags:{filme:-1,pos2010:1,acao:1,fantasia:1,scifi:-1,americano:-1,poderes:1,historico:-1,comedia:-1,adulto:1,longo:-1,oscar:-1,adaptacao:1,franquia:1,vilao:1,finaltriste:1,romance:-1,animacao:1,criancas:-1,espaco:-1,crime:-1,guerra:1,antiheroi:1,terror:1,trilhafamosa:1,ante2000:-1,reviravolta:1,sobrevive:-1,viagemtempo:-1,baseadofatos:-1,maisdeuma:1,anime:1,superheroi:-1,amizade:1,naohuman:1,classico:-1,muitosprot:1,posapoc:-1,protmulher:-1,danca:-1,mexico:-1,brasil:-1,japao:1,infantil:-1,orfao:1,magia:-1,esporte:-1,musical:-1,policial:-1,sobrenatural:-1,familia:-1,vinganca:1,survival:1,distopia:1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:-1,mitologia:-1}},
  {id:'t005',tmdb:37854,nome:'One Piece',tipo:'tv',raridade:'comum',yt:'ouSMQEFCCGc',capa:'https://image.tmdb.org/t/p/w500/e3NBGiAifW9Xt8xD5tQfOtNPXDY.jpg',sinopse:'Monkey D. Luffy navega pelos mares em busca do tesouro One Piece.',tags:{filme:-1,pos2010:-1,acao:1,fantasia:1,scifi:-1,americano:-1,poderes:1,historico:-1,comedia:1,adulto:-1,longo:-1,oscar:-1,adaptacao:1,franquia:1,vilao:1,finaltriste:-1,romance:-1,animacao:1,criancas:1,espaco:-1,crime:-1,guerra:1,antiheroi:-1,terror:-1,trilhafamosa:1,ante2000:1,reviravolta:1,sobrevive:1,viagemtempo:-1,baseadofatos:-1,maisdeuma:1,anime:1,superheroi:-1,amizade:1,naohuman:1,classico:1,muitosprot:1,posapoc:-1,protmulher:-1,danca:-1,mexico:-1,brasil:-1,japao:1,infantil:1,orfao:1,magia:-1,esporte:-1,musical:-1,policial:-1,sobrenatural:-1,familia:1,vinganca:-1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:-1,mitologia:-1}},
  {id:'t006',tmdb:1396,nome:'Breaking Bad',tipo:'tv',raridade:'comum',yt:'HhesHhDkmQs',capa:'https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5L9pCfOacjizRGt.jpg',sinopse:'Professor de química com câncer começa a fabricar metanfetamina.',tags:{filme:-1,pos2010:-1,acao:-1,fantasia:-1,scifi:-1,americano:1,poderes:-1,historico:-1,comedia:-1,adulto:1,longo:-1,oscar:1,adaptacao:-1,franquia:-1,vilao:1,finaltriste:1,romance:-1,animacao:-1,criancas:-1,espaco:-1,crime:1,guerra:-1,antiheroi:1,terror:-1,trilhafamosa:1,ante2000:-1,reviravolta:1,sobrevive:-1,viagemtempo:-1,baseadofatos:-1,maisdeuma:1,anime:-1,superheroi:-1,amizade:-1,naohuman:-1,classico:1,muitosprot:-1,posapoc:-1,protmulher:-1,danca:-1,mexico:-1,brasil:-1,japao:-1,infantil:-1,orfao:-1,magia:-1,esporte:-1,musical:-1,policial:1,sobrenatural:-1,familia:1,vinganca:-1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:-1,mitologia:-1}},
  {id:'t007',tmdb:1399,nome:'Game of Thrones',tipo:'tv',raridade:'comum',yt:'KPLWWIOCOOQ',capa:'https://image.tmdb.org/t/p/w500/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg',sinopse:'Famílias nobres guerreiam pelo trono dos Sete Reinos.',tags:{filme:-1,pos2010:1,acao:1,fantasia:1,scifi:-1,americano:1,poderes:1,historico:1,comedia:-1,adulto:1,longo:-1,oscar:1,adaptacao:1,franquia:-1,vilao:1,finaltriste:1,romance:1,animacao:-1,criancas:-1,espaco:-1,crime:1,guerra:1,antiheroi:1,terror:-1,trilhafamosa:1,ante2000:-1,reviravolta:1,sobrevive:-1,viagemtempo:-1,baseadofatos:-1,maisdeuma:1,anime:-1,superheroi:-1,amizade:-1,naohuman:1,classico:1,muitosprot:1,posapoc:-1,protmulher:1,danca:-1,mexico:-1,brasil:-1,japao:-1,infantil:-1,orfao:-1,magia:1,esporte:-1,musical:-1,policial:-1,sobrenatural:1,familia:-1,vinganca:1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:-1,mitologia:1}},
  {id:'t008',tmdb:66732,nome:'Stranger Things',tipo:'tv',raridade:'comum',yt:'b9EkMc79ZSU',capa:'https://image.tmdb.org/t/p/w500/49WJfeN0moxb9IPfGn8AIqMGskD.jpg',sinopse:'Crianças enfrentam forças sobrenaturais numa cidade pequena dos anos 80.',tags:{filme:-1,pos2010:1,acao:1,fantasia:1,scifi:1,americano:1,poderes:1,historico:-1,comedia:-1,adulto:-1,longo:-1,oscar:-1,adaptacao:-1,franquia:-1,vilao:1,finaltriste:-1,romance:1,animacao:-1,criancas:1,espaco:-1,crime:-1,guerra:-1,antiheroi:-1,terror:1,trilhafamosa:1,ante2000:-1,reviravolta:1,sobrevive:1,viagemtempo:-1,baseadofatos:-1,maisdeuma:1,anime:-1,superheroi:-1,amizade:1,naohuman:1,classico:-1,muitosprot:1,posapoc:-1,protmulher:-1,danca:-1,mexico:-1,brasil:-1,japao:-1,infantil:-1,orfao:-1,magia:-1,esporte:-1,musical:-1,policial:-1,sobrenatural:1,familia:1,vinganca:-1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:-1,mitologia:-1}},
  {id:'t009',tmdb:238,nome:'O Poderoso Chefão',tipo:'movie',raridade:'medio',yt:'sY1S34973zA',capa:'https://image.tmdb.org/t/p/w500/3bhkrj58Vtu7enYsLegHnDmni2.jpg',sinopse:'A história da família Corleone, poderosa família da máfia italiana.',tags:{filme:1,pos2010:-1,acao:-1,fantasia:-1,scifi:-1,americano:1,poderes:-1,historico:1,comedia:-1,adulto:1,longo:1,oscar:1,adaptacao:1,franquia:1,vilao:1,finaltriste:1,romance:1,animacao:-1,criancas:-1,espaco:-1,crime:1,guerra:-1,antiheroi:1,terror:-1,trilhafamosa:1,ante2000:1,reviravolta:1,sobrevive:-1,viagemtempo:-1,baseadofatos:-1,maisdeuma:1,anime:-1,superheroi:-1,amizade:-1,naohuman:-1,classico:1,muitosprot:1,posapoc:-1,protmulher:-1,danca:-1,mexico:-1,brasil:-1,japao:-1,infantil:-1,orfao:-1,magia:-1,esporte:-1,musical:-1,policial:1,sobrenatural:-1,familia:1,vinganca:1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:-1,mitologia:-1}},
  {id:'t010',tmdb:155,nome:'Batman: O Cavaleiro das Trevas',tipo:'movie',raridade:'comum',yt:'EXeTwQWrcwY',capa:'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg',sinopse:'Batman enfrenta o Coringa, criminoso caótico que aterroriza Gotham.',tags:{filme:1,pos2010:-1,acao:1,fantasia:-1,scifi:1,americano:1,poderes:-1,historico:-1,comedia:-1,adulto:-1,longo:1,oscar:1,adaptacao:1,franquia:1,vilao:1,finaltriste:1,romance:-1,animacao:-1,criancas:-1,espaco:-1,crime:1,guerra:-1,antiheroi:1,terror:-1,trilhafamosa:1,ante2000:-1,reviravolta:1,sobrevive:1,viagemtempo:-1,baseadofatos:-1,maisdeuma:1,anime:-1,superheroi:1,amizade:-1,naohuman:-1,classico:1,muitosprot:-1,posapoc:-1,protmulher:-1,danca:-1,mexico:-1,brasil:-1,japao:-1,infantil:-1,orfao:1,magia:-1,esporte:-1,musical:-1,policial:1,sobrenatural:-1,familia:-1,vinganca:-1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:-1,mitologia:-1}},
  {id:'t011',tmdb:278,nome:'Um Sonho de Liberdade',tipo:'movie',raridade:'medio',yt:'PLl99DlL6b4',capa:'https://image.tmdb.org/t/p/w500/lyQBXzOQSuE59IsHyhrp0qIiPAz.jpg',sinopse:'Banqueiro inocente planeja fuga após anos preso injustamente.',tags:{filme:1,pos2010:-1,acao:-1,fantasia:-1,scifi:-1,americano:1,poderes:-1,historico:-1,comedia:-1,adulto:1,longo:1,oscar:1,adaptacao:1,franquia:-1,vilao:1,finaltriste:-1,romance:-1,animacao:-1,criancas:-1,espaco:-1,crime:1,guerra:-1,antiheroi:-1,terror:-1,trilhafamosa:1,ante2000:1,reviravolta:1,sobrevive:1,viagemtempo:-1,baseadofatos:-1,maisdeuma:-1,anime:-1,superheroi:-1,amizade:1,naohuman:-1,classico:1,muitosprot:-1,posapoc:-1,protmulher:-1,danca:-1,mexico:-1,brasil:-1,japao:-1,infantil:-1,orfao:-1,magia:-1,esporte:-1,musical:-1,policial:1,sobrenatural:-1,familia:-1,vinganca:-1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:-1,mitologia:-1}},
  {id:'t012',tmdb:27205,nome:'A Origem',tipo:'movie',raridade:'medio',yt:'YoHD9XEInc0',capa:'https://image.tmdb.org/t/p/w500/edv5CZvWj09paC4NZTiEXIk4hPX.jpg',sinopse:'Ladrão especialista em roubar segredos dos sonhos recebe missão impossível.',tags:{filme:1,pos2010:1,acao:1,fantasia:1,scifi:1,americano:1,poderes:-1,historico:-1,comedia:-1,adulto:-1,longo:1,oscar:1,adaptacao:-1,franquia:-1,vilao:1,finaltriste:1,romance:1,animacao:-1,criancas:-1,espaco:-1,crime:-1,guerra:-1,antiheroi:-1,terror:-1,trilhafamosa:1,ante2000:-1,reviravolta:1,sobrevive:1,viagemtempo:1,baseadofatos:-1,maisdeuma:-1,anime:-1,superheroi:-1,amizade:-1,naohuman:-1,classico:1,muitosprot:1,posapoc:-1,protmulher:-1,danca:-1,mexico:-1,brasil:-1,japao:-1,infantil:-1,orfao:-1,magia:-1,esporte:-1,musical:-1,policial:-1,sobrenatural:-1,familia:-1,vinganca:-1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:1,escola:-1,mitologia:-1}},
  {id:'t013',tmdb:13,nome:'Forrest Gump',tipo:'movie',raridade:'comum',yt:'bLvqoHBptjg',capa:'https://image.tmdb.org/t/p/w500/arw2vcBveWOVZr6pxd9XTd1TdQa.jpg',sinopse:'Homem simples do Alabama vive aventuras extraordinárias ao longo da história americana.',tags:{filme:1,pos2010:-1,acao:-1,fantasia:-1,scifi:-1,americano:1,poderes:-1,historico:1,comedia:1,adulto:-1,longo:1,oscar:1,adaptacao:1,franquia:-1,vilao:-1,finaltriste:1,romance:1,animacao:-1,criancas:-1,espaco:-1,crime:-1,guerra:1,antiheroi:-1,terror:-1,trilhafamosa:1,ante2000:1,reviravolta:-1,sobrevive:1,viagemtempo:-1,baseadofatos:1,maisdeuma:-1,anime:-1,superheroi:-1,amizade:1,naohuman:-1,classico:1,muitosprot:-1,posapoc:-1,protmulher:-1,danca:-1,mexico:-1,brasil:-1,japao:-1,infantil:-1,orfao:-1,magia:-1,esporte:1,musical:-1,policial:-1,sobrenatural:-1,familia:1,vinganca:-1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:-1,mitologia:-1}},
  {id:'t014',tmdb:157336,nome:'Interestelar',tipo:'movie',raridade:'medio',yt:'zSWdZVtXT7E',capa:'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',sinopse:'Astronautas viajam por buraco de minhoca em busca de novo lar para a humanidade.',tags:{filme:1,pos2010:1,acao:-1,fantasia:-1,scifi:1,americano:1,poderes:-1,historico:-1,comedia:-1,adulto:-1,longo:1,oscar:1,adaptacao:-1,franquia:-1,vilao:-1,finaltriste:1,romance:1,animacao:-1,criancas:-1,espaco:1,crime:-1,guerra:-1,antiheroi:-1,terror:-1,trilhafamosa:1,ante2000:-1,reviravolta:1,sobrevive:1,viagemtempo:1,baseadofatos:-1,maisdeuma:-1,anime:-1,superheroi:-1,amizade:-1,naohuman:-1,classico:-1,muitosprot:-1,posapoc:-1,protmulher:-1,danca:-1,mexico:-1,brasil:-1,japao:-1,infantil:-1,orfao:-1,magia:-1,esporte:-1,musical:-1,policial:-1,sobrenatural:-1,familia:1,vinganca:-1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:-1,mitologia:-1}},
  {id:'t015',tmdb:372058,nome:'Seu Nome',tipo:'movie',raridade:'raro',yt:'xU47nhruN-Q',capa:'https://image.tmdb.org/t/p/w500/q719jXXEzOoYaps6babgKnONONX.jpg',sinopse:'Dois adolescentes japoneses trocam de corpo misteriosamente e se apaixonam.',tags:{filme:1,pos2010:1,acao:-1,fantasia:1,scifi:-1,americano:-1,poderes:-1,historico:-1,comedia:-1,adulto:-1,longo:-1,oscar:-1,adaptacao:-1,franquia:-1,vilao:-1,finaltriste:1,romance:1,animacao:1,criancas:1,espaco:-1,crime:-1,guerra:-1,antiheroi:-1,terror:-1,trilhafamosa:1,ante2000:-1,reviravolta:1,sobrevive:1,viagemtempo:1,baseadofatos:-1,maisdeuma:-1,anime:1,superheroi:-1,amizade:-1,naohuman:-1,classico:1,muitosprot:-1,posapoc:-1,protmulher:1,danca:-1,mexico:-1,brasil:-1,japao:1,infantil:-1,orfao:-1,magia:1,esporte:-1,musical:-1,policial:-1,sobrenatural:1,familia:-1,vinganca:-1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:1,mitologia:-1}},
  {id:'t016',tmdb:598,nome:'Cidade de Deus',tipo:'movie',raridade:'medio',yt:'GFgupBUSLDo',capa:'https://image.tmdb.org/t/p/w500/k7eYdWvhYQyRQoU2TB2A2Xu2grZ.jpg',sinopse:'História do crescimento do crime numa favela do Rio de Janeiro.',tags:{filme:1,pos2010:-1,acao:1,fantasia:-1,scifi:-1,americano:-1,poderes:-1,historico:1,comedia:-1,adulto:1,longo:-1,oscar:1,adaptacao:1,franquia:-1,vilao:1,finaltriste:1,romance:1,animacao:-1,criancas:1,espaco:-1,crime:1,guerra:-1,antiheroi:1,terror:-1,trilhafamosa:1,ante2000:-1,reviravolta:-1,sobrevive:-1,viagemtempo:-1,baseadofatos:1,maisdeuma:-1,anime:-1,superheroi:-1,amizade:1,naohuman:-1,classico:1,muitosprot:1,posapoc:-1,protmulher:-1,danca:-1,mexico:-1,brasil:1,japao:-1,infantil:-1,orfao:1,magia:-1,esporte:-1,musical:-1,policial:1,sobrenatural:-1,familia:-1,vinganca:1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:-1,mitologia:-1}},
  {id:'t017',tmdb:18785,nome:'Titanic',tipo:'movie',raridade:'comum',yt:'zAGVQLHvwOY',capa:'https://image.tmdb.org/t/p/w500/9xjZS2rlVxm8SFx8kPC3aIGCOYQ.jpg',sinopse:'Jovem rica e rapaz pobre se apaixonam no famoso navio que afundou.',tags:{filme:1,pos2010:-1,acao:-1,fantasia:-1,scifi:-1,americano:1,poderes:-1,historico:1,comedia:-1,adulto:-1,longo:1,oscar:1,adaptacao:-1,franquia:-1,vilao:-1,finaltriste:1,romance:1,animacao:-1,criancas:-1,espaco:-1,crime:-1,guerra:-1,antiheroi:-1,terror:-1,trilhafamosa:1,ante2000:1,reviravolta:-1,sobrevive:-1,viagemtempo:-1,baseadofatos:1,maisdeuma:-1,anime:-1,superheroi:-1,amizade:-1,naohuman:-1,classico:1,muitosprot:-1,posapoc:-1,protmulher:1,danca:-1,mexico:-1,brasil:-1,japao:-1,infantil:-1,orfao:-1,magia:-1,esporte:-1,musical:-1,policial:-1,sobrenatural:-1,familia:-1,vinganca:-1,survival:1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:-1,mitologia:-1}},
  {id:'t018',tmdb:129,nome:'O Castelo Animado',tipo:'movie',raridade:'raro',yt:'iwROgK8kfjo',capa:'https://image.tmdb.org/t/p/w500/mXT9BEkECMsKFsOFrHFdaXOFXiL.jpg',sinopse:'Jovem costureira amaldiçoada busca ajuda num castelo ambulante.',tags:{filme:1,pos2010:-1,acao:-1,fantasia:1,scifi:-1,americano:-1,poderes:1,historico:1,comedia:1,adulto:-1,longo:-1,oscar:1,adaptacao:1,franquia:-1,vilao:1,finaltriste:-1,romance:1,animacao:1,criancas:1,espaco:-1,crime:-1,guerra:1,antiheroi:-1,terror:-1,trilhafamosa:1,ante2000:-1,reviravolta:1,sobrevive:1,viagemtempo:-1,baseadofatos:-1,maisdeuma:-1,anime:1,superheroi:-1,amizade:-1,naohuman:1,classico:1,muitosprot:-1,posapoc:-1,protmulher:1,danca:-1,mexico:-1,brasil:-1,japao:1,infantil:1,orfao:-1,magia:1,esporte:-1,musical:-1,policial:-1,sobrenatural:1,familia:-1,vinganca:-1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:-1,mitologia:-1}},
  {id:'t019',tmdb:76492,nome:'Miraculous: As Aventuras de Ladybug',tipo:'tv',raridade:'medio',yt:'jE69pKZFCoc',capa:'https://image.tmdb.org/t/p/w500/dd2wnAOmMj0gRdQWpHeMSm2Kx2q.jpg',sinopse:'Estudante parisiense se transforma em super-heroína para proteger Paris.',tags:{filme:-1,pos2010:1,acao:1,fantasia:1,scifi:-1,americano:-1,poderes:1,historico:-1,comedia:1,adulto:-1,longo:-1,oscar:-1,adaptacao:-1,franquia:1,vilao:1,finaltriste:-1,romance:1,animacao:1,criancas:1,espaco:-1,crime:-1,guerra:-1,antiheroi:-1,terror:-1,trilhafamosa:1,ante2000:-1,reviravolta:-1,sobrevive:1,viagemtempo:-1,baseadofatos:-1,maisdeuma:1,anime:-1,superheroi:1,amizade:1,naohuman:-1,classico:-1,muitosprot:-1,posapoc:-1,protmulher:1,danca:-1,mexico:-1,brasil:-1,japao:-1,infantil:1,orfao:-1,magia:1,esporte:-1,musical:-1,policial:-1,sobrenatural:-1,familia:-1,vinganca:-1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:1,mitologia:-1}},
  {id:'t020',tmdb:11,nome:'Star Wars: Uma Nova Esperança',tipo:'movie',raridade:'comum',yt:'vZ734NWnAHA',capa:'https://image.tmdb.org/t/p/w500/6FfCtAuVAW8XJjZ7eWeLibRLWTw.jpg',sinopse:'Jovem fazendeiro descobre seu destino e luta contra um império galáctico.',tags:{filme:1,pos2010:-1,acao:1,fantasia:1,scifi:1,americano:1,poderes:1,historico:-1,comedia:-1,adulto:-1,longo:-1,oscar:1,adaptacao:-1,franquia:1,vilao:1,finaltriste:-1,romance:-1,animacao:-1,criancas:1,espaco:1,crime:-1,guerra:1,antiheroi:-1,terror:-1,trilhafamosa:1,ante2000:1,reviravolta:1,sobrevive:1,viagemtempo:-1,baseadofatos:-1,maisdeuma:1,anime:-1,superheroi:-1,amizade:1,naohuman:1,classico:1,muitosprot:1,posapoc:-1,protmulher:-1,danca:-1,mexico:-1,brasil:-1,japao:-1,infantil:1,orfao:1,magia:1,esporte:-1,musical:-1,policial:-1,sobrenatural:-1,familia:-1,vinganca:-1,survival:-1,distopia:-1,robos:1,zumbi:-1,vampiro:-1,espiao:-1,escola:-1,mitologia:-1}},
  {id:'t021',tmdb:85552,nome:'Euphoria',tipo:'tv',raridade:'medio',yt:'3i8qGLANBZc',capa:'https://image.tmdb.org/t/p/w500/3Q0hd3heuWwDWpwcDkhQOA6TYWI.jpg',sinopse:'Adolescentes navegam por identidade, trauma, drogas e relacionamentos.',tags:{filme:-1,pos2010:1,acao:-1,fantasia:-1,scifi:-1,americano:1,poderes:-1,historico:-1,comedia:-1,adulto:1,longo:-1,oscar:1,adaptacao:-1,franquia:-1,vilao:-1,finaltriste:1,romance:1,animacao:-1,criancas:1,espaco:-1,crime:1,guerra:-1,antiheroi:-1,terror:-1,trilhafamosa:1,ante2000:-1,reviravolta:-1,sobrevive:-1,viagemtempo:-1,baseadofatos:-1,maisdeuma:1,anime:-1,superheroi:-1,amizade:1,naohuman:-1,classico:-1,muitosprot:1,posapoc:-1,protmulher:1,danca:-1,mexico:-1,brasil:-1,japao:-1,infantil:-1,orfao:-1,magia:-1,esporte:-1,musical:-1,policial:-1,sobrenatural:-1,familia:-1,vinganca:-1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:1,mitologia:-1}},
  {id:'t022',tmdb:22794,nome:'REC',tipo:'movie',raridade:'raro',yt:'R3RQ21b5D3A',capa:'https://image.tmdb.org/t/p/w500/4b8wS8tWHMhSRUMvVzMvhgV8GJu.jpg',sinopse:'Repórter fica presa num prédio infestado por mortos-vivos.',tags:{filme:1,pos2010:-1,acao:1,fantasia:-1,scifi:-1,americano:-1,poderes:-1,historico:-1,comedia:-1,adulto:1,longo:-1,oscar:-1,adaptacao:-1,franquia:1,vilao:1,finaltriste:1,romance:-1,animacao:-1,criancas:-1,espaco:-1,crime:-1,guerra:-1,antiheroi:-1,terror:1,trilhafamosa:-1,ante2000:-1,reviravolta:1,sobrevive:-1,viagemtempo:-1,baseadofatos:-1,maisdeuma:1,anime:-1,superheroi:-1,amizade:-1,naohuman:1,classico:-1,muitosprot:-1,posapoc:-1,protmulher:1,danca:-1,mexico:-1,brasil:-1,japao:-1,infantil:-1,orfao:-1,magia:-1,esporte:-1,musical:-1,policial:-1,sobrenatural:1,familia:-1,vinganca:-1,survival:1,distopia:-1,robos:-1,zumbi:1,vampiro:-1,espiao:-1,escola:-1,mitologia:-1}},
  {id:'t023',tmdb:539,nome:'O Exorcista',tipo:'movie',raridade:'raro',yt:'YDGw1MTEe9k',capa:'https://image.tmdb.org/t/p/w500/4Bph0hhnDH6dpc0SZIV522bLm4P.jpg',sinopse:'Menina é possuída por entidade demoníaca e padres tentam exorcizá-la.',tags:{filme:1,pos2010:-1,acao:-1,fantasia:1,scifi:-1,americano:1,poderes:1,historico:-1,comedia:-1,adulto:1,longo:-1,oscar:1,adaptacao:1,franquia:1,vilao:1,finaltriste:1,romance:-1,animacao:-1,criancas:1,espaco:-1,crime:-1,guerra:-1,antiheroi:-1,terror:1,trilhafamosa:1,ante2000:1,reviravolta:1,sobrevive:-1,viagemtempo:-1,baseadofatos:-1,maisdeuma:1,anime:-1,superheroi:-1,amizade:-1,naohuman:1,classico:1,muitosprot:-1,posapoc:-1,protmulher:1,danca:-1,mexico:-1,brasil:-1,japao:-1,infantil:-1,orfao:-1,magia:1,esporte:-1,musical:-1,policial:-1,sobrenatural:1,familia:1,vinganca:-1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:-1,mitologia:-1}},
  {id:'t024',tmdb:10515,nome:'Camp Rock',tipo:'movie',raridade:'raro',yt:'5NPBIwQyPWE',capa:'https://image.tmdb.org/t/p/w500/dT6EYeNmSQQPqBRqOBjJXcI5pFc.jpg',sinopse:'Jovem talentosa conquista vaga num acampamento de música para ricos.',tags:{filme:1,pos2010:-1,acao:-1,fantasia:-1,scifi:-1,americano:1,poderes:-1,historico:-1,comedia:1,adulto:-1,longo:-1,oscar:-1,adaptacao:-1,franquia:1,vilao:-1,finaltriste:-1,romance:1,animacao:-1,criancas:1,espaco:-1,crime:-1,guerra:-1,antiheroi:-1,terror:-1,trilhafamosa:1,ante2000:-1,reviravolta:-1,sobrevive:1,viagemtempo:-1,baseadofatos:-1,maisdeuma:1,anime:-1,superheroi:-1,amizade:1,naohuman:-1,classico:-1,muitosprot:-1,posapoc:-1,protmulher:1,danca:1,mexico:-1,brasil:-1,japao:-1,infantil:1,orfao:-1,magia:-1,esporte:-1,musical:1,policial:-1,sobrenatural:-1,familia:-1,vinganca:-1,survival:-1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:1,mitologia:-1}},
  {id:'t025',tmdb:2649,nome:'A Bruxa de Blair',tipo:'movie',raridade:'raro',yt:'NX3GNLKKMNs',capa:'https://image.tmdb.org/t/p/w500/9z0C4j4NEJ4bEfVaJXSHgHAMhbZ.jpg',sinopse:'Três estudantes desaparecem numa floresta investigando a lenda da Bruxa de Blair.',tags:{filme:1,pos2010:-1,acao:-1,fantasia:-1,scifi:-1,americano:1,poderes:-1,historico:-1,comedia:-1,adulto:1,longo:-1,oscar:-1,adaptacao:-1,franquia:1,vilao:1,finaltriste:1,romance:-1,animacao:-1,criancas:-1,espaco:-1,crime:-1,guerra:-1,antiheroi:-1,terror:1,trilhafamosa:-1,ante2000:1,reviravolta:1,sobrevive:-1,viagemtempo:-1,baseadofatos:-1,maisdeuma:1,anime:-1,superheroi:-1,amizade:-1,naohuman:1,classico:1,muitosprot:-1,posapoc:-1,protmulher:1,danca:-1,mexico:-1,brasil:-1,japao:-1,infantil:-1,orfao:-1,magia:1,esporte:-1,musical:-1,policial:-1,sobrenatural:1,familia:-1,vinganca:-1,survival:1,distopia:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,escola:-1,mitologia:-1}}
];

const PERGUNTAS = [
  {id:'filme',txt:'É um filme (não uma série)?'},
  {id:'pos2010',txt:'Foi lançado depois de 2010?'},
  {id:'acao',txt:'É de ação ou aventura?'},
  {id:'fantasia',txt:'Tem elementos de fantasia ou magia?'},
  {id:'scifi',txt:'Tem ficção científica?'},
  {id:'americano',txt:'É produção americana?'},
  {id:'poderes',txt:'O protagonista tem poderes especiais?'},
  {id:'historico',txt:'A história se passa no passado?'},
  {id:'comedia',txt:'É comédia com muito humor?'},
  {id:'adulto',txt:'É voltado para adultos?'},
  {id:'longo',txt:'Dura mais de 2 horas?'},
  {id:'oscar',txt:'Ganhou ou foi indicado ao Oscar?'},
  {id:'adaptacao',txt:'É baseado em livro, quadrinho ou jogo?'},
  {id:'franquia',txt:'Faz parte de uma franquia ou tem sequências?'},
  {id:'vilao',txt:'Tem um vilão muito marcante?'},
  {id:'finaltriste',txt:'O final é triste ou ambíguo?'},
  {id:'romance',txt:'O romance é parte importante?'},
  {id:'animacao',txt:'É animação?'},
  {id:'criancas',txt:'Os protagonistas são crianças ou adolescentes?'},
  {id:'espaco',txt:'A história acontece no espaço?'},
  {id:'crime',txt:'Envolve crime ou mundo criminoso?'},
  {id:'guerra',txt:'Tem cenas de guerra?'},
  {id:'antiheroi',txt:'O protagonista é um anti-herói?'},
  {id:'terror',txt:'É terror ou suspense?'},
  {id:'trilhafamosa',txt:'Tem trilha sonora muito famosa?'},
  {id:'ante2000',txt:'Foi lançado antes do ano 2000?'},
  {id:'reviravolta',txt:'Tem uma reviravolta surpreendente?'},
  {id:'sobrevive',txt:'O protagonista sobrevive até o final?'},
  {id:'viagemtempo',txt:'Envolve viagem no tempo?'},
  {id:'baseadofatos',txt:'É baseado em fatos reais?'},
  {id:'maisdeuma',txt:'Tem mais de uma temporada ou sequência?'},
  {id:'anime',txt:'É anime ou produção japonesa?'},
  {id:'superheroi',txt:'Tem super-heróis com traje?'},
  {id:'amizade',txt:'A amizade é tema central?'},
  {id:'naohuman',txt:'Tem personagens não-humanos importantes?'},
  {id:'classico',txt:'É considerado um grande clássico?'},
  {id:'muitosprot',txt:'Tem vários protagonistas?'},
  {id:'posapoc',txt:'O mundo é pós-apocalíptico?'},
  {id:'protmulher',txt:'A protagonista principal é mulher?'},
  {id:'danca',txt:'Tem cenas de dança importantes?'},
  {id:'mexico',txt:'É mexicano ou se passa no México?'},
  {id:'brasil',txt:'É brasileiro ou se passa no Brasil?'},
  {id:'japao',txt:'É japonês ou se passa no Japão?'},
  {id:'infantil',txt:'É voltado para crianças?'},
  {id:'orfao',txt:'O protagonista é órfão?'},
  {id:'magia',txt:'Tem magia ou feitiçaria?'},
  {id:'esporte',txt:'O esporte é tema importante?'},
  {id:'musical',txt:'É um musical com personagens cantando?'},
  {id:'policial',txt:'Tem investigação policial?'},
  {id:'sobrenatural',txt:'Tem elementos sobrenaturais?'},
  {id:'familia',txt:'A família é tema central?'},
  {id:'vinganca',txt:'A vingança é motivação principal?'},
  {id:'survival',txt:'Envolve sobrevivência extrema?'},
  {id:'distopia',txt:'É distopia futurista?'},
  {id:'robos',txt:'Tem robôs ou inteligência artificial?'},
  {id:'zumbi',txt:'Tem zumbis?'},
  {id:'vampiro',txt:'Tem vampiros?'},
  {id:'espiao',txt:'Tem espiões ou agentes secretos?'},
  {id:'escola',txt:'Se passa principalmente numa escola?'},
  {id:'mitologia',txt:'Envolve mitologia grega, nórdica ou similar?'},
];

function initTitulos() {
  const dados = lerTitulos();
  if (dados.titulos.length === 0) {
    dados.titulos = TITULOS_INICIAIS;
    salvarTitulos(dados);
    console.log('Banco inicial:', TITULOS_INICIAIS.length, 'títulos');
  }
}

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

app.get('/api/titulos', (req, res) => {
  const dados = lerTitulos();
  res.json({ titulos: dados.titulos, total: dados.titulos.length });
});

app.get('/api/perguntas', (req, res) => {
  const dinamicas = lerPergsD();
  // Mescla fixas + dinâmicas, remove duplicatas por id
  const todasIds = new Set(PERGUNTAS.map(p => p.id));
  const extras = (dinamicas.perguntas || []).filter(p => !todasIds.has(p.id));
  res.json([...PERGUNTAS, ...extras]);
});

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

app.post('/api/sugerir', async (req, res) => {
  const { nome, username } = req.body;
  if (!nome) return res.json({ erro: 'Informe o nome!' });
  const titulos = lerTitulos();
  if (titulos.titulos.find(t => t.nome.toLowerCase() === nome.toLowerCase())) return res.json({ sucesso: true, msg: 'Título já está no banco!' });
  const fila = lerFila();
  if (fila.pendentes.find(p => p.nome.toLowerCase() === nome.toLowerCase())) return res.json({ sucesso: true, msg: 'Já está em processamento!' });
  fila.pendentes.push({ id: uuidv4(), nome, sugeridoPor: username, data: new Date().toISOString() });
  salvarFila(fila);
  processarTitulo(nome).catch(console.error);
  res.json({ sucesso: true, msg: `"${nome}" enviado para processamento! Em breve estará no banco.` });
});

app.get('/api/fila', (req, res) => {
  const fila = lerFila();
  res.json({ pendentes: fila.pendentes.length, processados: fila.processados.slice(-10) });
});

async function processarTitulo(nome) {
  console.log('Processando:', nome);
  try {
    // Busca em pt-BR primeiro, depois en como fallback
    const busca = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}&query=${encodeURIComponent(nome)}&language=pt-BR`);
    const bd = await busca.json();
    if (!bd.results || bd.results.length === 0) { console.log('Não encontrado no TMDB:', nome); return; }
    
    const r = bd.results[0];
    const tipo = r.media_type === 'movie' ? 'movie' : 'tv';
    const tmdbId = r.id;
    
    // Busca detalhes completos para pegar nome oficial em pt-BR
    const detUrl = `https://api.themoviedb.org/3/${tipo}/${tmdbId}?api_key=${TMDB_KEY}&language=pt-BR`;
    let nomeFinal = r.title || r.name || nome;
    let sinopse = r.overview || '';
    let generos = r.genre_ids || [];
    
    try {
      const det = await fetch(detUrl);
      const dd = await det.json();
      // Usa nome em pt-BR se disponível, senão original
      nomeFinal = dd.title || dd.name || nomeFinal;
      sinopse = dd.overview || sinopse;
      generos = (dd.genres || []).map(g => g.id);
    } catch(e) {}
    
    // Nome de busca para Deezer = nome original (mais preciso)
    const nomeOriginal = r.original_title || r.original_name || nomeFinal;
    
    const capa = r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : '';
    const ano = (r.release_date || r.first_air_date || '2000').slice(0, 4);
    const pop = r.popularity || 0;
    const raridade = pop > 50 ? 'comum' : pop > 10 ? 'medio' : 'raro';
    const tags = await gerarTagsIA(nomeFinal, sinopse, generos, tipo, ano);
    
    const titulos = lerTitulos();
    if (!titulos.titulos.find(t => t.tmdb === tmdbId)) {
      const novoTitulo = { 
        id: 't' + Date.now(), 
        tmdb: tmdbId, 
        nome: nomeFinal,
        nomeOriginal,  // salva nome original para busca de música
        tipo, raridade, yt: null, capa, sinopse, tags 
      };
      titulos.titulos.push(novoTitulo);
      salvarTitulos(titulos);
      console.log('✅ Adicionado:', nomeFinal, '| Original:', nomeOriginal);
      // Gera perguntas específicas imediatamente
      if (OR_KEY && sinopse) gerarPerguntasEspecificas(nomeFinal, sinopse, tags).catch(console.error);
    }
    
    const fila = lerFila();
    fila.pendentes = fila.pendentes.filter(p => p.nome.toLowerCase() !== nome.toLowerCase());
    fila.processados.push({ nome: nomeFinal, data: new Date().toISOString() });
    if (fila.processados.length > 100) fila.processados = fila.processados.slice(-100);
    salvarFila(fila);
  } catch (e) { console.error('Erro processando:', nome, e.message); }
}

async function gerarTagsIA(nome, sinopse, generos, tipo, ano) {
  const tags = {};
  PERGUNTAS.forEach(p => { tags[p.id] = 0; });
  if (generos.includes(28)) tags.acao = 1;
  if (generos.includes(12)) tags.acao = 1;
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
  if (generos.includes(36)) { tags.historico = 1; }
  if (generos.includes(9648)) tags.reviravolta = 1;
  if (generos.includes(10762)) tags.infantil = 1;
  if (generos.includes(10765)) { tags.fantasia = 1; tags.scifi = 1; }
  tags.filme = tipo === 'movie' ? 1 : -1;
  tags.pos2010 = parseInt(ano) >= 2010 ? 1 : -1;
  tags.ante2000 = parseInt(ano) < 2000 ? 1 : -1;

  if (OR_KEY && sinopse) {
    try {
      const prompt = `Analise: "${nome}" (${tipo === 'movie' ? 'Filme' : 'Série'}, ${ano})
Sinopse: ${sinopse}
Responda SOMENTE com JSON válido:
{"poderes":0,"vilao":0,"finaltriste":0,"criancas":0,"espaco":0,"antiheroi":0,"trilhafamosa":0,"reviravolta":0,"sobrevive":0,"viagemtempo":0,"maisdeuma":0,"anime":0,"superheroi":0,"amizade":0,"naohuman":0,"classico":0,"muitosprot":0,"posapoc":0,"protmulher":0,"danca":0,"mexico":0,"brasil":0,"japao":0,"infantil":0,"orfao":0,"esporte":0,"policial":0,"familia":0,"vinganca":0,"survival":0,"distopia":0,"robos":0,"zumbi":0,"vampiro":0,"espiao":0,"escola":0,"mitologia":0,"oscar":0,"longo":0}
Use 1=sim, -1=não, 0=incerto.`;
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${OR_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://darkinatror.up.railway.app' },
        body: JSON.stringify({ model: OR_MODEL, max_tokens: 400, messages: [{ role: 'user', content: prompt }] })
      });
      const rd = await resp.json();
      const txt = rd.choices?.[0]?.message?.content || '';
      const match = txt.match(/\{[\s\S]*\}/);
      if (match) Object.assign(tags, JSON.parse(match[0]));
    } catch (e) { console.log('OpenRouter indisponível'); }
  }
  return tags;
}

// ============================================================
// GERAÇÃO DE PERGUNTAS ESPECÍFICAS POR TÍTULO
// ============================================================
async function gerarPerguntasEspecificas(nome, sinopse, tagsExistentes) {
  if (!OR_KEY) return;
  try {
    const tagsStr = Object.entries(tagsExistentes||{}).filter(([,v])=>v===1).map(([k])=>k).join(', ');
    const prompt = `Você é um assistente do jogo DarkiNator (estilo Akinator de filmes/séries).

Título: "${nome}"
Sinopse: "${sinopse}"
Tags que já existem: ${tagsStr}

Gere 5 perguntas SIM/NÃO muito específicas e únicas para este título que ajudariam a diferenciá-lo de outros.
Perguntas boas são aquelas que só este título (ou poucos) responderia SIM.

Responda SOMENTE com JSON válido, sem texto extra:
[
  {"id": "id_unico_snake_case", "txt": "Pergunta clara em português?", "titulo": "${nome}", "resposta": 1},
  {"id": "id_unico_snake_case", "txt": "Pergunta clara em português?", "titulo": "${nome}", "resposta": 1}
]

Regras:
- id deve ser único, em snake_case, sem espaços, sem acentos
- txt deve ser uma pergunta clara terminando com ?
- resposta: 1 se o título responde SIM, -1 se NÃO
- Seja criativo: características visuais, personagens famosos, objetos icônicos, locais, épocas`;

    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OR_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://darkinatror.up.railway.app' },
      body: JSON.stringify({ model: OR_MODEL, max_tokens: 600, messages: [{ role: 'user', content: prompt }] })
    });
    const rd = await resp.json();
    const txt = rd.choices?.[0]?.message?.content || '';
    const match = txt.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (!match) return;
    
    const novas = JSON.parse(match[0]);
    if (!Array.isArray(novas) || novas.length === 0) return;

    const pergsD = lerPergsD();
    const idsExistentes = new Set([
      ...PERGUNTAS.map(p => p.id),
      ...(pergsD.perguntas || []).map(p => p.id)
    ]);

    let adicionadas = 0;
    for (const p of novas) {
      if (!p.id || !p.txt || idsExistentes.has(p.id)) continue;
      // Valida o id — só letras, números e _
      if (!/^[a-z0-9_]+$/.test(p.id)) continue;
      pergsD.perguntas.push({ id: p.id, txt: p.txt, titulo: nome, resposta: p.resposta || 1, geradoEm: new Date().toISOString() });
      idsExistentes.add(p.id);
      adicionadas++;
    }

    if (adicionadas > 0) {
      salvarPergsD(pergsD);
      console.log(`💬 ${adicionadas} perguntas novas geradas para: ${nome}`);
      
      // Adiciona as tags novas ao título no banco
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
  } catch(e) { console.log('Erro gerando perguntas para', nome, ':', e.message); }
}

// ============================================================
// GERAÇÃO EM LOTE — 100 perguntas a cada 6h
// ============================================================
let geracaoRodando = false;
async function gerarPerguntasEmLote() {
  if (!OR_KEY || geracaoRodando) return;
  geracaoRodando = true;
  
  const pergsD = lerPergsD();
  const hoje = new Date().toDateString();
  if (pergsD.ultimaGeracao === hoje) { geracaoRodando = false; return; }
  
  console.log('💬 Gerando perguntas em lote...');
  const titulos = lerTitulos();
  
  // Pega até 20 títulos aleatórios para gerar perguntas
  const amostra = [...titulos.titulos].sort(() => Math.random() - 0.5).slice(0, 20);
  let totalGeradas = 0;

  for (const titulo of amostra) {
    if (totalGeradas >= 100) break;
    if (!titulo.sinopse) continue;
    try {
      await gerarPerguntasEspecificas(titulo.nome, titulo.sinopse, titulo.tags || {});
      totalGeradas += 5;
      await new Promise(r => setTimeout(r, 1500));
    } catch(e) { console.log('Erro lote:', e.message); }
  }

  pergsD.ultimaGeracao = hoje;
  salvarPergsD(pergsD);
  geracaoRodando = false;
  
  const total = lerPergsD().perguntas.length;
  console.log(`💬 Lote concluído. Total perguntas dinâmicas: ${total}`);
}

let expansaoRodando = false;
async function expandirBanco() {
  if (expansaoRodando) return;
  expansaoRodando = true;
  const titulos = lerTitulos();
  const hoje = new Date().toDateString();
  if (titulos.ultimaExpansao === hoje && (titulos.expansaoHoje || 0) >= 250) { expansaoRodando = false; return; }
  if (titulos.ultimaExpansao !== hoje) { titulos.expansaoHoje = 0; titulos.ultimaExpansao = hoje; salvarTitulos(titulos); }
  console.log('Expandindo... Total atual:', titulos.titulos.length);
  const p = Math.floor(Math.random() * 20) + 1;
  const urls = [
    `https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_KEY}&language=pt-BR&page=${p}`,
    `https://api.themoviedb.org/3/tv/popular?api_key=${TMDB_KEY}&language=pt-BR&page=${p}`,
    `https://api.themoviedb.org/3/movie/top_rated?api_key=${TMDB_KEY}&language=pt-BR&page=${p}`,
    `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&with_genres=16&language=pt-BR&page=${Math.floor(Math.random()*10)+1}`,
    `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_KEY}&with_original_language=ja&language=pt-BR&page=${Math.floor(Math.random()*10)+1}`,
    `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&with_genres=27&language=pt-BR&page=${Math.floor(Math.random()*10)+1}`,
    `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_KEY}&with_genres=10762&language=pt-BR&page=${Math.floor(Math.random()*10)+1}`,
  ];
  for (const url of urls) {
    const t = lerTitulos();
    if ((t.expansaoHoje || 0) >= 250) break;
    try {
      const r = await fetch(url);
      const d = await r.json();
      for (const item of (d.results || []).slice(0, 6)) {
        const t2 = lerTitulos();
        if ((t2.expansaoHoje || 0) >= 250) break;
        if (!t2.titulos.find(x => x.tmdb === item.id)) {
          await processarTitulo(item.title || item.name);
          const t3 = lerTitulos();
          t3.expansaoHoje = (t3.expansaoHoje || 0) + 1;
          salvarTitulos(t3);
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    } catch (e) { console.error('Expansão erro:', e.message); }
  }
  expansaoRodando = false;
  console.log('Expansão ok. Total:', lerTitulos().titulos.length);
}

app.get('/api/comentarios/:tituloId', (req, res) => {
  const db = lerDB();
  res.json((db.comentarios || []).filter(c => c.tituloId === req.params.tituloId).slice(-30));
});
app.post('/api/comentario', (req, res) => {
  const { username, avatarIdx, tituloId, texto } = req.body;
  if (!texto) return res.json({ erro: 'Texto vazio' });
  const db = lerDB();
  if (!db.comentarios) db.comentarios = [];
  const com = { id: uuidv4(), username, avatarIdx: avatarIdx || 0, tituloId, texto, data: new Date().toISOString() };
  db.comentarios.push(com);
  salvarDB(db);
  res.json({ sucesso: true, comentario: com });
});

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
  res.json({ totalTitulos: t.titulos.length, filaProcessando: f.pendentes.length, versao: '3.0' });
});

// Perguntas dinâmicas salvas
app.get('/api/perguntas-dinamicas', (req, res) => {
  const d = lerPergsD();
  res.json({ total: (d.perguntas||[]).length, perguntas: d.perguntas||[] });
});

// Busca música no Deezer pelo backend — sistema inteligente de matching
app.get('/api/musica', async (req, res) => {
  const nome = req.query.q;
  if (!nome) return res.json({ erro: 'Informe q' });
  try {
    const nomeMin = nome.toLowerCase();
    
    // Usa nome original para busca (mais preciso no Deezer)
    const nomeOriginal = req.query.original || nome;
    
    // Função de score para avaliar quão relevante é a faixa
    function scoreFaixa(track) {
      let score = 0;
      const titulo = (track.title || '').toLowerCase();
      const album = (track.album?.title || '').toLowerCase();
      const artista = (track.artist?.name || '').toLowerCase();
      
      // Match exato no título da faixa = máxima prioridade
      if (titulo.includes(nomeMin)) score += 100;
      // Match no álbum = alta prioridade  
      if (album.includes(nomeMin)) score += 80;
      // Palavras-chave de trilha no título
      if (titulo.includes('theme') || titulo.includes('opening') || titulo.includes('soundtrack')) score += 30;
      if (titulo.includes('trilha') || titulo.includes('tema')) score += 30;
      // Penaliza covers e remixes
      if (titulo.includes('cover') || titulo.includes('remix') || titulo.includes('karaoke')) score -= 50;
      // Tem preview disponível
      if (track.preview) score += 20;
      
      return score;
    }
    
    const tentativas = [
      `${nomeOriginal} theme`,
      `${nomeOriginal} opening`,
      `${nomeOriginal} soundtrack`,
      `${nome} trilha sonora`,
      `${nome} tema musical`,
      nomeOriginal,
    ];
    
    let melhorTrack = null;
    let melhorScore = -999;
    
    for (const q of tentativas) {
      try {
        const r = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=10`);
        const d = await r.json();
        if (!d.data || d.data.length === 0) continue;
        
        for (const track of d.data) {
          if (!track.preview) continue;
          const s = scoreFaixa(track);
          if (s > melhorScore) {
            melhorScore = s;
            melhorTrack = track;
          }
        }
        
        // Se achou match de alta qualidade, para de buscar
        if (melhorScore >= 80) break;
      } catch(e) { continue; }
    }
    
    if (!melhorTrack || melhorScore < 0) {
      return res.json({ erro: 'Trilha não encontrada' });
    }
    
    res.json({
      titulo: melhorTrack.title,
      artista: melhorTrack.artist?.name || '',
      preview: melhorTrack.preview,
      capa: melhorTrack.album?.cover_medium || melhorTrack.album?.cover_small || '',
      score: melhorScore
    });
  } catch(e) {
    res.json({ erro: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`DarkiNator v3 porta ${PORT}`);
  initTitulos();
  setTimeout(() => expandirBanco(), 15000);
  setInterval(() => expandirBanco(), 6 * 60 * 60 * 1000);
  // Gera perguntas dinâmicas em lote a cada 6h (com 30min de offset)
  setTimeout(() => gerarPerguntasEmLote(), 30 * 60 * 1000);
  setInterval(() => gerarPerguntasEmLote(), 6 * 60 * 60 * 1000);
});
