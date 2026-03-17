const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Fetch universal
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
// PATHS E CONFIG
// ============================================================
const DATA_DIR      = fs.existsSync('/data') ? '/data' : __dirname;
const DB_PATH       = path.join(DATA_DIR, 'db.json');
const TITULOS_PATH  = path.join(DATA_DIR, 'titulos.json');
const PERGS_PATH    = path.join(DATA_DIR, 'perguntas.json');
const FILA_PATH     = path.join(DATA_DIR, 'fila.json');

const TMDB_KEY  = process.env.TMDB_KEY || '8265bd1679663a7ea12ac168da84d2e8';
const OR_KEY    = process.env.OPENROUTER_KEY || '';
const OR_MODEL  = 'google/gemini-2.0-flash-exp:free';
const GH_TOKEN  = process.env.GITHUB_TOKEN || '';
const GH_REPO   = process.env.GITHUB_REPO || 'adeusbrpfui-hash/DarkiNator';
const GH_BRANCH = process.env.GITHUB_BRANCH || 'main';

// ============================================================
// HELPERS JSON — NUNCA APAGA, SÓ ADICIONA
// ============================================================
function lerJSON(p, def) {
  try { if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8')); } catch {}
  return def;
}

function salvarSeguro(p, dados) {
  try {
    // Proteção: nunca salva se o novo dado tiver menos itens que o atual
    if (p === TITULOS_PATH) {
      const atual = lerJSON(p, { titulos: [] });
      if (dados.titulos && atual.titulos && dados.titulos.length < atual.titulos.length) {
        console.log('⚠️ PROTEÇÃO: tentativa de reduzir banco bloqueada!', atual.titulos.length, '->', dados.titulos.length);
        return;
      }
    }
    if (p === PERGS_PATH) {
      const atual = lerJSON(p, { perguntas: [] });
      if (dados.perguntas && atual.perguntas && dados.perguntas.length < atual.perguntas.length) {
        console.log('⚠️ PROTEÇÃO: tentativa de reduzir perguntas bloqueada!');
        return;
      }
    }
    fs.writeFileSync(p, JSON.stringify(dados, null, 2));
  } catch(e) { console.error('Erro ao salvar:', e.message); }
}

const lerDB       = () => lerJSON(DB_PATH,      { usuarios:[], resultados:[], comentarios:[] });
const salvarDB    = d  => salvarSeguro(DB_PATH, d);
const lerTitulos  = () => lerJSON(TITULOS_PATH, { titulos:[], expansaoHoje:0, ultimaExpansao:'' });
const salvarTitulos = d => salvarSeguro(TITULOS_PATH, d);
const lerPergs    = () => lerJSON(PERGS_PATH,   { perguntas:[] });
const salvarPergs = d  => salvarSeguro(PERGS_PATH, d);
const lerFila     = () => lerJSON(FILA_PATH,    { pendentes:[], processados:[] });
const salvarFila  = d  => salvarSeguro(FILA_PATH, d);

// ============================================================
// GITHUB — PERSISTÊNCIA PERMANENTE
// ============================================================
async function carregarDoGitHub(arquivo) {
  if (!GH_TOKEN) return null;
  try {
    const url = `https://api.github.com/repos/${GH_REPO}/contents/data/${arquivo}?ref=${GH_BRANCH}`;
    const r = await fetch(url, {
      headers: { 'Authorization': `token ${GH_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!r.ok) return null;
    const d = await r.json();
    return JSON.parse(Buffer.from(d.content, 'base64').toString('utf8'));
  } catch(e) { return null; }
}

async function salvarNoGitHub(arquivo, dados) {
  if (!GH_TOKEN) return;
  try {
    const conteudo = JSON.stringify(dados, null, 2);
    const base64 = Buffer.from(conteudo).toString('base64');
    const url = `https://api.github.com/repos/${GH_REPO}/contents/data/${arquivo}`;
    let sha = null;
    try {
      const rGet = await fetch(url + `?ref=${GH_BRANCH}`, {
        headers: { 'Authorization': `token ${GH_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
      });
      if (rGet.ok) { const dGet = await rGet.json(); sha = dGet.sha; }
    } catch(e) {}
    const body = { message: `auto: ${arquivo} atualizado`, content: base64, branch: GH_BRANCH };
    if (sha) body.sha = sha;
    const rPut = await fetch(url, {
      method: 'PUT',
      headers: { 'Authorization': `token ${GH_TOKEN}`, 'Content-Type': 'application/json', 'Accept': 'application/vnd.github.v3+json' },
      body: JSON.stringify(body)
    });
    if (rPut.ok) console.log('✅ GitHub salvo:', arquivo);
    else { const err = await rPut.json(); console.log('GitHub err:', err.message); }
  } catch(e) { console.log('GitHub salvar erro:', e.message); }
}

// Salva banco + perguntas no GitHub a cada 30 min se houve mudanças
let ultimoTotalTitulos = 0;
let ultimoTotalPergs = 0;
setInterval(async () => {
  const t = lerTitulos();
  const p = lerPergs();
  if (t.titulos.length !== ultimoTotalTitulos) {
    ultimoTotalTitulos = t.titulos.length;
    await salvarNoGitHub('titulos.json', t);
  }
  if (p.perguntas.length !== ultimoTotalPergs) {
    ultimoTotalPergs = p.perguntas.length;
    await salvarNoGitHub('perguntas.json', p);
  }
}, 30 * 60 * 1000);

// ============================================================
// BANCO INICIAL — 25 TÍTULOS
// ============================================================
const TITULOS_INICIAIS = [
  {id:'t001',tmdb:217,   nome:'Chaves',                          nomeOriginal:'El Chavo del Ocho',          tipo:'tv',    raridade:'comum', capa:'https://image.tmdb.org/t/p/w500/iODFGNDmuUFWBQBiuKcGsVbMCdN.jpg', sinopse:'Série cômica mexicana sobre um menino órfão chamado Chaves que mora num barril numa vila pobre. Com seus amigos Quico, Chiquinha e os adultos vizinhos, vive situações engraçadas no México dos anos 70.', tags:{filme:-1,animacao:-1,anime:-1,pos2010:-1,ante2000:1,americano:-1,japao:-1,brasil:-1,mexico:1,adulto:-1,infantil:1,criancas:1,acao:-1,terror:-1,comedia:1,romance:-1,scifi:-1,fantasia:-1,crime:-1,guerra:-1,poderes:-1,superheroi:-1,magia:-1,vilao:1,maisdeuma:1,franquia:1,classico:1,oscar:-1,longo:-1,espaco:-1,sobrenatural:-1,naohuman:-1,muitosprot:1,protmulher:-1,antiheroi:-1,orfao:1,familia:1,amizade:1,finaltriste:-1,reviravolta:-1,sobrevive:1,viagemtempo:-1,baseadofatos:-1,historico:-1,distopia:-1,posapoc:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,musical:-1,danca:-1,esporte:-1,policial:-1,trilhafamosa:1,escola:1,mitologia:-1,survival:-1,vinganca:-1,adaptacao:-1}},
  {id:'t002',tmdb:1425,  nome:'Winx Club',                       nomeOriginal:'Winx Club',                  tipo:'tv',    raridade:'medio', capa:'https://image.tmdb.org/t/p/w500/mTOuB5UMF2oVGbdHGSCFEqDlqpP.jpg', sinopse:'Grupo de fadas adolescentes chamadas Winx estudam na escola Alfea e usam seus poderes mágicos para proteger o universo de vilões. Bloom, Stella, Flora, Musa, Tecna e Aisha formam o time.', tags:{filme:-1,animacao:1,anime:-1,pos2010:-1,ante2000:-1,americano:-1,japao:-1,brasil:-1,mexico:-1,adulto:-1,infantil:1,criancas:1,acao:1,terror:-1,comedia:-1,romance:1,scifi:-1,fantasia:1,crime:-1,guerra:-1,poderes:1,superheroi:1,magia:1,vilao:1,maisdeuma:1,franquia:1,classico:-1,oscar:-1,longo:-1,espaco:-1,sobrenatural:1,naohuman:-1,muitosprot:1,protmulher:1,antiheroi:-1,orfao:-1,familia:-1,amizade:1,finaltriste:-1,reviravolta:-1,sobrevive:1,viagemtempo:-1,baseadofatos:-1,historico:-1,distopia:-1,posapoc:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,musical:-1,danca:-1,esporte:-1,policial:-1,trilhafamosa:1,escola:1,mitologia:-1,survival:-1,vinganca:-1,adaptacao:-1}},
  {id:'t003',tmdb:12171, nome:'Dragon Ball Z',                   nomeOriginal:'Dragon Ball Z',              tipo:'tv',    raridade:'comum', capa:'https://image.tmdb.org/t/p/w500/oSJaWvxDpnMXEpKFJBTzDHxn6uw.jpg', sinopse:'Goku e seus amigos guerreiros Z defendem a Terra de vilões cada vez mais poderosos. Combates épicos, transformações Super Saiyajin e amizade são temas centrais desta série anime japonesa.', tags:{filme:-1,animacao:1,anime:1,pos2010:-1,ante2000:1,americano:-1,japao:1,brasil:-1,mexico:-1,adulto:-1,infantil:1,criancas:1,acao:1,terror:-1,comedia:-1,romance:-1,scifi:-1,fantasia:1,crime:-1,guerra:1,poderes:1,superheroi:1,magia:-1,vilao:1,maisdeuma:1,franquia:1,classico:1,oscar:-1,longo:-1,espaco:1,sobrenatural:-1,naohuman:1,muitosprot:1,protmulher:-1,antiheroi:-1,orfao:-1,familia:1,amizade:1,finaltriste:-1,reviravolta:1,sobrevive:1,viagemtempo:1,baseadofatos:-1,historico:-1,distopia:-1,posapoc:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,musical:-1,danca:-1,esporte:-1,policial:-1,trilhafamosa:1,escola:-1,mitologia:-1,survival:-1,vinganca:-1,adaptacao:1}},
  {id:'t004',tmdb:46260, nome:'Attack on Titan',                 nomeOriginal:'Shingeki no Kyojin',         tipo:'tv',    raridade:'medio', capa:'https://image.tmdb.org/t/p/w500/hTP1DtLGFAmAn92954tFmkgAToe.jpg', sinopse:'Em um mundo onde a humanidade vive atrás de muros gigantes para se proteger de titãs devoradores, Eren Yeager jura destruir todos os titãs após sua mãe ser devorada por um.', tags:{filme:-1,animacao:1,anime:1,pos2010:1,ante2000:-1,americano:-1,japao:1,brasil:-1,mexico:-1,adulto:1,infantil:-1,criancas:-1,acao:1,terror:1,comedia:-1,romance:-1,scifi:-1,fantasia:1,crime:-1,guerra:1,poderes:1,superheroi:-1,magia:-1,vilao:1,maisdeuma:1,franquia:1,classico:-1,oscar:-1,longo:-1,espaco:-1,sobrenatural:-1,naohuman:1,muitosprot:1,protmulher:-1,antiheroi:1,orfao:1,familia:-1,amizade:1,finaltriste:1,reviravolta:1,sobrevive:-1,viagemtempo:-1,baseadofatos:-1,historico:-1,distopia:1,posapoc:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,musical:-1,danca:-1,esporte:-1,policial:-1,trilhafamosa:1,escola:-1,mitologia:-1,survival:1,vinganca:1,adaptacao:1}},
  {id:'t005',tmdb:37854, nome:'One Piece',                       nomeOriginal:'One Piece',                  tipo:'tv',    raridade:'comum', capa:'https://image.tmdb.org/t/p/w500/e3NBGiAifW9Xt8xD5tQfOtNPXDY.jpg', sinopse:'Monkey D. Luffy, jovem com poderes de borracha, navega pelos mares com sua tripulação pirata em busca do lendário tesouro One Piece para se tornar o Rei dos Piratas.', tags:{filme:-1,animacao:1,anime:1,pos2010:-1,ante2000:1,americano:-1,japao:1,brasil:-1,mexico:-1,adulto:-1,infantil:1,criancas:1,acao:1,terror:-1,comedia:1,romance:-1,scifi:-1,fantasia:1,crime:-1,guerra:1,poderes:1,superheroi:-1,magia:-1,vilao:1,maisdeuma:1,franquia:1,classico:1,oscar:-1,longo:-1,espaco:-1,sobrenatural:-1,naohuman:1,muitosprot:1,protmulher:-1,antiheroi:-1,orfao:1,familia:1,amizade:1,finaltriste:-1,reviravolta:1,sobrevive:1,viagemtempo:-1,baseadofatos:-1,historico:-1,distopia:-1,posapoc:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,musical:-1,danca:-1,esporte:-1,policial:-1,trilhafamosa:1,escola:-1,mitologia:-1,survival:-1,vinganca:-1,adaptacao:1}},
  {id:'t006',tmdb:1396,  nome:'Breaking Bad',                    nomeOriginal:'Breaking Bad',               tipo:'tv',    raridade:'comum', capa:'https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5L9pCfOacjizRGt.jpg', sinopse:'Walter White, professor de química com câncer terminal, começa a fabricar metanfetamina com seu ex-aluno Jesse Pinkman para garantir o futuro financeiro da família.', tags:{filme:-1,animacao:-1,anime:-1,pos2010:-1,ante2000:-1,americano:1,japao:-1,brasil:-1,mexico:-1,adulto:1,infantil:-1,criancas:-1,acao:-1,terror:-1,comedia:-1,romance:-1,scifi:-1,fantasia:-1,crime:1,guerra:-1,poderes:-1,superheroi:-1,magia:-1,vilao:1,maisdeuma:1,franquia:-1,classico:1,oscar:1,longo:-1,espaco:-1,sobrenatural:-1,naohuman:-1,muitosprot:-1,protmulher:-1,antiheroi:1,orfao:-1,familia:1,amizade:-1,finaltriste:1,reviravolta:1,sobrevive:-1,viagemtempo:-1,baseadofatos:-1,historico:-1,distopia:-1,posapoc:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,musical:-1,danca:-1,esporte:-1,policial:1,trilhafamosa:1,escola:-1,mitologia:-1,survival:-1,vinganca:-1,adaptacao:-1}},
  {id:'t007',tmdb:1399,  nome:'Game of Thrones',                 nomeOriginal:'Game of Thrones',            tipo:'tv',    raridade:'comum', capa:'https://image.tmdb.org/t/p/w500/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg', sinopse:'Famílias nobres guerreiam pelo Trono de Ferro dos Sete Reinos de Westeros num mundo de fantasia épica com dragões, magia e traições políticas brutais.', tags:{filme:-1,animacao:-1,anime:-1,pos2010:1,ante2000:-1,americano:1,japao:-1,brasil:-1,mexico:-1,adulto:1,infantil:-1,criancas:-1,acao:1,terror:-1,comedia:-1,romance:1,scifi:-1,fantasia:1,crime:1,guerra:1,poderes:1,superheroi:-1,magia:1,vilao:1,maisdeuma:1,franquia:-1,classico:1,oscar:1,longo:-1,espaco:-1,sobrenatural:1,naohuman:1,muitosprot:1,protmulher:1,antiheroi:1,orfao:-1,familia:-1,amizade:-1,finaltriste:1,reviravolta:1,sobrevive:-1,viagemtempo:-1,baseadofatos:-1,historico:1,distopia:-1,posapoc:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,musical:-1,danca:-1,esporte:-1,policial:-1,trilhafamosa:1,escola:-1,mitologia:1,survival:-1,vinganca:1,adaptacao:1}},
  {id:'t008',tmdb:66732, nome:'Stranger Things',                 nomeOriginal:'Stranger Things',            tipo:'tv',    raridade:'comum', capa:'https://image.tmdb.org/t/p/w500/49WJfeN0moxb9IPfGn8AIqMGskD.jpg', sinopse:'Em Hawkins, Indiana nos anos 80, crianças enfrentam forças sobrenaturais do Mundo Invertido. Eleven, com poderes telecinéticos, é central na luta contra criaturas e o governo.', tags:{filme:-1,animacao:-1,anime:-1,pos2010:1,ante2000:-1,americano:1,japao:-1,brasil:-1,mexico:-1,adulto:-1,infantil:-1,criancas:1,acao:1,terror:1,comedia:-1,romance:1,scifi:1,fantasia:1,crime:-1,guerra:-1,poderes:1,superheroi:-1,magia:-1,vilao:1,maisdeuma:1,franquia:-1,classico:-1,oscar:-1,longo:-1,espaco:-1,sobrenatural:1,naohuman:1,muitosprot:1,protmulher:-1,antiheroi:-1,orfao:-1,familia:1,amizade:1,finaltriste:-1,reviravolta:1,sobrevive:1,viagemtempo:-1,baseadofatos:-1,historico:-1,distopia:-1,posapoc:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,musical:-1,danca:-1,esporte:-1,policial:-1,trilhafamosa:1,escola:-1,mitologia:-1,survival:-1,vinganca:-1,adaptacao:-1}},
  {id:'t009',tmdb:238,   nome:'O Poderoso Chefão',               nomeOriginal:'The Godfather',              tipo:'movie', raridade:'medio', capa:'https://image.tmdb.org/t/p/w500/3bhkrj58Vtu7enYsLegHnDmni2.jpg', sinopse:'Vito Corleone é o patriarca da poderosa família Corleone da máfia italiana em Nova York. Quando recusa uma proposta do rival Sollozzo, começa uma guerra entre famílias que transformará seu filho Michael.', tags:{filme:1,animacao:-1,anime:-1,pos2010:-1,ante2000:1,americano:1,japao:-1,brasil:-1,mexico:-1,adulto:1,infantil:-1,criancas:-1,acao:-1,terror:-1,comedia:-1,romance:1,scifi:-1,fantasia:-1,crime:1,guerra:-1,poderes:-1,superheroi:-1,magia:-1,vilao:1,maisdeuma:1,franquia:1,classico:1,oscar:1,longo:1,espaco:-1,sobrenatural:-1,naohuman:-1,muitosprot:1,protmulher:-1,antiheroi:1,orfao:-1,familia:1,amizade:-1,finaltriste:1,reviravolta:1,sobrevive:-1,viagemtempo:-1,baseadofatos:-1,historico:1,distopia:-1,posapoc:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,musical:-1,danca:-1,esporte:-1,policial:1,trilhafamosa:1,escola:-1,mitologia:-1,survival:-1,vinganca:1,adaptacao:1}},
  {id:'t010',tmdb:155,   nome:'Batman: O Cavaleiro das Trevas',  nomeOriginal:'The Dark Knight',            tipo:'movie', raridade:'comum', capa:'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg', sinopse:'Batman enfrenta o Coringa, agente do caos que aterroriza Gotham City. Com Harvey Dent, Bruce Wayne tenta salvar a cidade enquanto lida com os limites morais do heroísmo.', tags:{filme:1,animacao:-1,anime:-1,pos2010:-1,ante2000:-1,americano:1,japao:-1,brasil:-1,mexico:-1,adulto:-1,infantil:-1,criancas:-1,acao:1,terror:-1,comedia:-1,romance:-1,scifi:1,fantasia:-1,crime:1,guerra:-1,poderes:-1,superheroi:1,magia:-1,vilao:1,maisdeuma:1,franquia:1,classico:1,oscar:1,longo:1,espaco:-1,sobrenatural:-1,naohuman:-1,muitosprot:-1,protmulher:-1,antiheroi:1,orfao:1,familia:-1,amizade:-1,finaltriste:1,reviravolta:1,sobrevive:1,viagemtempo:-1,baseadofatos:-1,historico:-1,distopia:-1,posapoc:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,musical:-1,danca:-1,esporte:-1,policial:1,trilhafamosa:1,escola:-1,mitologia:-1,survival:-1,vinganca:-1,adaptacao:1}},
  {id:'t011',tmdb:278,   nome:'Um Sonho de Liberdade',           nomeOriginal:'The Shawshank Redemption',   tipo:'movie', raridade:'medio', capa:'https://image.tmdb.org/t/p/w500/lyQBXzOQSuE59IsHyhrp0qIiPAz.jpg', sinopse:'Andy Dufresne, banqueiro condenado injustamente por duplo homicídio, passa 19 anos na prisão de Shawshank fazendo amizade com Red enquanto planeja secretamente sua fuga.', tags:{filme:1,animacao:-1,anime:-1,pos2010:-1,ante2000:1,americano:1,japao:-1,brasil:-1,mexico:-1,adulto:1,infantil:-1,criancas:-1,acao:-1,terror:-1,comedia:-1,romance:-1,scifi:-1,fantasia:-1,crime:1,guerra:-1,poderes:-1,superheroi:-1,magia:-1,vilao:1,maisdeuma:-1,franquia:-1,classico:1,oscar:1,longo:1,espaco:-1,sobrenatural:-1,naohuman:-1,muitosprot:-1,protmulher:-1,antiheroi:-1,orfao:-1,familia:-1,amizade:1,finaltriste:-1,reviravolta:1,sobrevive:1,viagemtempo:-1,baseadofatos:-1,historico:-1,distopia:-1,posapoc:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,musical:-1,danca:-1,esporte:-1,policial:1,trilhafamosa:1,escola:-1,mitologia:-1,survival:-1,vinganca:-1,adaptacao:1}},
  {id:'t012',tmdb:27205, nome:'A Origem',                        nomeOriginal:'Inception',                  tipo:'movie', raridade:'medio', capa:'https://image.tmdb.org/t/p/w500/edv5CZvWj09paC4NZTiEXIk4hPX.jpg', sinopse:'Dom Cobb é um ladrão especialista em entrar nos sonhos das pessoas para roubar segredos. Ele recebe uma missão impossível: plantar uma ideia na mente de um alvo.', tags:{filme:1,animacao:-1,anime:-1,pos2010:1,ante2000:-1,americano:1,japao:-1,brasil:-1,mexico:-1,adulto:-1,infantil:-1,criancas:-1,acao:1,terror:-1,comedia:-1,romance:1,scifi:1,fantasia:1,crime:-1,guerra:-1,poderes:-1,superheroi:-1,magia:-1,vilao:1,maisdeuma:-1,franquia:-1,classico:1,oscar:1,longo:1,espaco:-1,sobrenatural:-1,naohuman:-1,muitosprot:1,protmulher:-1,antiheroi:-1,orfao:-1,familia:-1,amizade:-1,finaltriste:1,reviravolta:1,sobrevive:1,viagemtempo:1,baseadofatos:-1,historico:-1,distopia:-1,posapoc:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:1,musical:-1,danca:-1,esporte:-1,policial:-1,trilhafamosa:1,escola:-1,mitologia:-1,survival:-1,vinganca:-1,adaptacao:-1}},
  {id:'t013',tmdb:13,    nome:'Forrest Gump',                    nomeOriginal:'Forrest Gump',               tipo:'movie', raridade:'comum', capa:'https://image.tmdb.org/t/p/w500/arw2vcBveWOVZr6pxd9XTd1TdQa.jpg', sinopse:'Forrest Gump, homem simples do Alabama, testemunha e participa de eventos históricos americanos como Vietnam e Watergate enquanto busca sua amada Jenny.', tags:{filme:1,animacao:-1,anime:-1,pos2010:-1,ante2000:1,americano:1,japao:-1,brasil:-1,mexico:-1,adulto:-1,infantil:-1,criancas:-1,acao:-1,terror:-1,comedia:1,romance:1,scifi:-1,fantasia:-1,crime:-1,guerra:1,poderes:-1,superheroi:-1,magia:-1,vilao:-1,maisdeuma:-1,franquia:-1,classico:1,oscar:1,longo:1,espaco:-1,sobrenatural:-1,naohuman:-1,muitosprot:-1,protmulher:-1,antiheroi:-1,orfao:-1,familia:1,amizade:1,finaltriste:1,reviravolta:-1,sobrevive:1,viagemtempo:-1,baseadofatos:1,historico:1,distopia:-1,posapoc:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,musical:-1,danca:-1,esporte:1,policial:-1,trilhafamosa:1,escola:-1,mitologia:-1,survival:-1,vinganca:-1,adaptacao:1}},
  {id:'t014',tmdb:157336,nome:'Interestelar',                    nomeOriginal:'Interstellar',               tipo:'movie', raridade:'medio', capa:'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg', sinopse:'Cooper, ex-piloto da NASA, lidera expedição pelo buraco de minhoca de Saturno para encontrar novo planeta habitável enquanto a Terra se aproxima da extinção.', tags:{filme:1,animacao:-1,anime:-1,pos2010:1,ante2000:-1,americano:1,japao:-1,brasil:-1,mexico:-1,adulto:-1,infantil:-1,criancas:-1,acao:-1,terror:-1,comedia:-1,romance:1,scifi:1,fantasia:-1,crime:-1,guerra:-1,poderes:-1,superheroi:-1,magia:-1,vilao:-1,maisdeuma:-1,franquia:-1,classico:-1,oscar:1,longo:1,espaco:1,sobrenatural:-1,naohuman:-1,muitosprot:-1,protmulher:-1,antiheroi:-1,orfao:-1,familia:1,amizade:-1,finaltriste:1,reviravolta:1,sobrevive:1,viagemtempo:1,baseadofatos:-1,historico:-1,distopia:-1,posapoc:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,musical:-1,danca:-1,esporte:-1,policial:-1,trilhafamosa:1,escola:-1,mitologia:-1,survival:-1,vinganca:-1,adaptacao:-1}},
  {id:'t015',tmdb:372058,nome:'Seu Nome',                        nomeOriginal:'Kimi no Na wa',              tipo:'movie', raridade:'raro',  capa:'https://image.tmdb.org/t/p/w500/q719jXXEzOoYaps6babgKnONONX.jpg', sinopse:'Mitsuha e Taki trocam de corpo misteriosamente enquanto dormem. Eles começam a deixar mensagens um para o outro e se apaixonam sem nunca se encontrar.', tags:{filme:1,animacao:1,anime:1,pos2010:1,ante2000:-1,americano:-1,japao:1,brasil:-1,mexico:-1,adulto:-1,infantil:-1,criancas:1,acao:-1,terror:-1,comedia:-1,romance:1,scifi:-1,fantasia:1,crime:-1,guerra:-1,poderes:-1,superheroi:-1,magia:1,vilao:-1,maisdeuma:-1,franquia:-1,classico:1,oscar:-1,longo:-1,espaco:-1,sobrenatural:1,naohuman:-1,muitosprot:-1,protmulher:1,antiheroi:-1,orfao:-1,familia:-1,amizade:-1,finaltriste:1,reviravolta:1,sobrevive:1,viagemtempo:1,baseadofatos:-1,historico:-1,distopia:-1,posapoc:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,musical:-1,danca:-1,esporte:-1,policial:-1,trilhafamosa:1,escola:1,mitologia:-1,survival:-1,vinganca:-1,adaptacao:-1}},
  {id:'t016',tmdb:598,   nome:'Cidade de Deus',                  nomeOriginal:'Cidade de Deus',             tipo:'movie', raridade:'medio', capa:'https://image.tmdb.org/t/p/w500/k7eYdWvhYQyRQoU2TB2A2Xu2grZ.jpg', sinopse:'Na favela Cidade de Deus no Rio de Janeiro, Buscapé documenta o crescimento do tráfico de drogas dos anos 60 até os 80, centrado no criminoso Zé Pequeno.', tags:{filme:1,animacao:-1,anime:-1,pos2010:-1,ante2000:-1,americano:-1,japao:-1,brasil:1,mexico:-1,adulto:1,infantil:-1,criancas:1,acao:1,terror:-1,comedia:-1,romance:1,scifi:-1,fantasia:-1,crime:1,guerra:-1,poderes:-1,superheroi:-1,magia:-1,vilao:1,maisdeuma:-1,franquia:-1,classico:1,oscar:1,longo:-1,espaco:-1,sobrenatural:-1,naohuman:-1,muitosprot:1,protmulher:-1,antiheroi:1,orfao:1,familia:-1,amizade:1,finaltriste:1,reviravolta:-1,sobrevive:-1,viagemtempo:-1,baseadofatos:1,historico:1,distopia:-1,posapoc:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,musical:-1,danca:-1,esporte:-1,policial:1,trilhafamosa:1,escola:-1,mitologia:-1,survival:-1,vinganca:1,adaptacao:1}},
  {id:'t017',tmdb:597,   nome:'Titanic',                         nomeOriginal:'Titanic',                    tipo:'movie', raridade:'comum', capa:'https://image.tmdb.org/t/p/w500/9xjZS2rlVxm8SFx8kPC3aIGCOYQ.jpg', sinopse:'Em 1912, a jovem aristocrata Rose e o artista pobre Jack se apaixonam no navio Titanic em sua viagem inaugural. Quando o navio colide com um iceberg, os dois lutam para sobreviver.', tags:{filme:1,animacao:-1,anime:-1,pos2010:-1,ante2000:1,americano:1,japao:-1,brasil:-1,mexico:-1,adulto:-1,infantil:-1,criancas:-1,acao:-1,terror:-1,comedia:-1,romance:1,scifi:-1,fantasia:-1,crime:-1,guerra:-1,poderes:-1,superheroi:-1,magia:-1,vilao:-1,maisdeuma:-1,franquia:-1,classico:1,oscar:1,longo:1,espaco:-1,sobrenatural:-1,naohuman:-1,muitosprot:-1,protmulher:1,antiheroi:-1,orfao:-1,familia:-1,amizade:-1,finaltriste:1,reviravolta:-1,sobrevive:-1,viagemtempo:-1,baseadofatos:1,historico:1,distopia:-1,posapoc:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,musical:-1,danca:-1,esporte:-1,policial:-1,trilhafamosa:1,escola:-1,mitologia:-1,survival:1,vinganca:-1,adaptacao:-1}},
  {id:'t018',tmdb:129,   nome:'O Castelo Animado',               nomeOriginal:'Howls Moving Castle',       tipo:'movie', raridade:'raro',  capa:'https://image.tmdb.org/t/p/w500/mXT9BEkECMsKFsOFrHFdaXOFXiL.jpg', sinopse:'Sophie, jovem costureira amaldiçoada pela Bruxa das Baldas que a transforma em velha, busca ajuda no castelo ambulante do feiticeiro Howl. Studio Ghibli de Miyazaki.', tags:{filme:1,animacao:1,anime:1,pos2010:-1,ante2000:-1,americano:-1,japao:1,brasil:-1,mexico:-1,adulto:-1,infantil:1,criancas:1,acao:-1,terror:-1,comedia:1,romance:1,scifi:-1,fantasia:1,crime:-1,guerra:1,poderes:1,superheroi:-1,magia:1,vilao:1,maisdeuma:-1,franquia:-1,classico:1,oscar:1,longo:-1,espaco:-1,sobrenatural:1,naohuman:1,muitosprot:-1,protmulher:1,antiheroi:-1,orfao:-1,familia:-1,amizade:-1,finaltriste:-1,reviravolta:1,sobrevive:1,viagemtempo:-1,baseadofatos:-1,historico:1,distopia:-1,posapoc:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,musical:-1,danca:-1,esporte:-1,policial:-1,trilhafamosa:1,escola:-1,mitologia:-1,survival:-1,vinganca:-1,adaptacao:1}},
  {id:'t019',tmdb:76492, nome:'Miraculous: As Aventuras de Ladybug',nomeOriginal:'Miraculous Ladybug',     tipo:'tv',    raridade:'medio', capa:'https://image.tmdb.org/t/p/w500/dd2wnAOmMj0gRdQWpHeMSm2Kx2q.jpg', sinopse:'Marinette se transforma na super-heroína Ladybug para proteger Paris do vilão Papillon. Seu parceiro é Cat Noir, que ela não sabe ser Adrien, por quem é apaixonada.', tags:{filme:-1,animacao:1,anime:-1,pos2010:1,ante2000:-1,americano:-1,japao:-1,brasil:-1,mexico:-1,adulto:-1,infantil:1,criancas:1,acao:1,terror:-1,comedia:1,romance:1,scifi:-1,fantasia:1,crime:-1,guerra:-1,poderes:1,superheroi:1,magia:1,vilao:1,maisdeuma:1,franquia:1,classico:-1,oscar:-1,longo:-1,espaco:-1,sobrenatural:-1,naohuman:-1,muitosprot:-1,protmulher:1,antiheroi:-1,orfao:-1,familia:-1,amizade:1,finaltriste:-1,reviravolta:-1,sobrevive:1,viagemtempo:-1,baseadofatos:-1,historico:-1,distopia:-1,posapoc:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,musical:-1,danca:-1,esporte:-1,policial:-1,trilhafamosa:1,escola:1,mitologia:-1,survival:-1,vinganca:-1,adaptacao:-1}},
  {id:'t020',tmdb:11,    nome:'Star Wars: Uma Nova Esperança',   nomeOriginal:'Star Wars A New Hope',       tipo:'movie', raridade:'comum', capa:'https://image.tmdb.org/t/p/w500/6FfCtAuVAW8XJjZ7eWeLibRLWTw.jpg', sinopse:'Luke Skywalker se junta à Aliança Rebelde com o Jedi Obi-Wan Kenobi e Han Solo para resgatar a Princesa Leia e destruir a Estrela da Morte do Império Galáctico.', tags:{filme:1,animacao:-1,anime:-1,pos2010:-1,ante2000:1,americano:1,japao:-1,brasil:-1,mexico:-1,adulto:-1,infantil:1,criancas:1,acao:1,terror:-1,comedia:-1,romance:-1,scifi:1,fantasia:1,crime:-1,guerra:1,poderes:1,superheroi:-1,magia:1,vilao:1,maisdeuma:1,franquia:1,classico:1,oscar:1,longo:-1,espaco:1,sobrenatural:-1,naohuman:1,muitosprot:1,protmulher:-1,antiheroi:-1,orfao:1,familia:-1,amizade:1,finaltriste:-1,reviravolta:1,sobrevive:1,viagemtempo:-1,baseadofatos:-1,historico:-1,distopia:-1,posapoc:-1,robos:1,zumbi:-1,vampiro:-1,espiao:-1,musical:-1,danca:-1,esporte:-1,policial:-1,trilhafamosa:1,escola:-1,mitologia:-1,survival:-1,vinganca:-1,adaptacao:-1}},
  {id:'t021',tmdb:85552, nome:'Euphoria',                        nomeOriginal:'Euphoria',                   tipo:'tv',    raridade:'medio', capa:'https://image.tmdb.org/t/p/w500/3Q0hd3heuWwDWpwcDkhQOA6TYWI.jpg', sinopse:'Rue Bennett, adolescente viciada em drogas, narra a vida de seus amigos em East Highland enquanto lidam com vício, trauma, identidade e relacionamentos tóxicos.', tags:{filme:-1,animacao:-1,anime:-1,pos2010:1,ante2000:-1,americano:1,japao:-1,brasil:-1,mexico:-1,adulto:1,infantil:-1,criancas:1,acao:-1,terror:-1,comedia:-1,romance:1,scifi:-1,fantasia:-1,crime:1,guerra:-1,poderes:-1,superheroi:-1,magia:-1,vilao:-1,maisdeuma:1,franquia:-1,classico:-1,oscar:1,longo:-1,espaco:-1,sobrenatural:-1,naohuman:-1,muitosprot:1,protmulher:1,antiheroi:-1,orfao:-1,familia:-1,amizade:1,finaltriste:1,reviravolta:-1,sobrevive:-1,viagemtempo:-1,baseadofatos:-1,historico:-1,distopia:-1,posapoc:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,musical:-1,danca:-1,esporte:-1,policial:-1,trilhafamosa:1,escola:1,mitologia:-1,survival:-1,vinganca:-1,adaptacao:-1}},
  {id:'t022',tmdb:22794, nome:'REC',                             nomeOriginal:'REC',                        tipo:'movie', raridade:'raro',  capa:'https://image.tmdb.org/t/p/w500/4b8wS8tWHMhSRUMvVzMvhgV8GJu.jpg', sinopse:'Repórter Ángela e câmera ficam presos num prédio em Barcelona com moradores infectados por vírus misterioso após quarentena ser decretada.', tags:{filme:1,animacao:-1,anime:-1,pos2010:-1,ante2000:-1,americano:-1,japao:-1,brasil:-1,mexico:-1,adulto:1,infantil:-1,criancas:-1,acao:1,terror:1,comedia:-1,romance:-1,scifi:-1,fantasia:-1,crime:-1,guerra:-1,poderes:-1,superheroi:-1,magia:-1,vilao:1,maisdeuma:1,franquia:1,classico:-1,oscar:-1,longo:-1,espaco:-1,sobrenatural:1,naohuman:1,muitosprot:-1,protmulher:1,antiheroi:-1,orfao:-1,familia:-1,amizade:-1,finaltriste:1,reviravolta:1,sobrevive:-1,viagemtempo:-1,baseadofatos:-1,historico:-1,distopia:-1,posapoc:-1,robos:-1,zumbi:1,vampiro:-1,espiao:-1,musical:-1,danca:-1,esporte:-1,policial:-1,trilhafamosa:-1,escola:-1,mitologia:-1,survival:1,vinganca:-1,adaptacao:-1}},
  {id:'t023',tmdb:539,   nome:'O Exorcista',                     nomeOriginal:'The Exorcist',               tipo:'movie', raridade:'raro',  capa:'https://image.tmdb.org/t/p/w500/4Bph0hhnDH6dpc0SZIV522bLm4P.jpg', sinopse:'Regan MacNeil, menina de 12 anos, começa a demonstrar comportamentos perturbadores após brincar com ouija. Sua mãe chama dois padres para realizar um exorcismo.', tags:{filme:1,animacao:-1,anime:-1,pos2010:-1,ante2000:1,americano:1,japao:-1,brasil:-1,mexico:-1,adulto:1,infantil:-1,criancas:1,acao:-1,terror:1,comedia:-1,romance:-1,scifi:-1,fantasia:1,crime:-1,guerra:-1,poderes:1,superheroi:-1,magia:1,vilao:1,maisdeuma:1,franquia:1,classico:1,oscar:1,longo:-1,espaco:-1,sobrenatural:1,naohuman:1,muitosprot:-1,protmulher:1,antiheroi:-1,orfao:-1,familia:1,amizade:-1,finaltriste:1,reviravolta:1,sobrevive:-1,viagemtempo:-1,baseadofatos:-1,historico:-1,distopia:-1,posapoc:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,musical:-1,danca:-1,esporte:-1,policial:-1,trilhafamosa:1,escola:-1,mitologia:-1,survival:-1,vinganca:-1,adaptacao:1}},
  {id:'t024',tmdb:10515, nome:'Camp Rock',                       nomeOriginal:'Camp Rock',                  tipo:'movie', raridade:'raro',  capa:'https://image.tmdb.org/t/p/w500/dT6EYeNmSQQPqBRqOBjJXcI5pFc.jpg', sinopse:'Mitchie Torres consegue vaga no acampamento de música Camp Rock. Lá encontra o astro arrogante Shane Gray dos Connect 3 e descobre sua verdadeira voz cantando.', tags:{filme:1,animacao:-1,anime:-1,pos2010:-1,ante2000:-1,americano:1,japao:-1,brasil:-1,mexico:-1,adulto:-1,infantil:1,criancas:1,acao:-1,terror:-1,comedia:1,romance:1,scifi:-1,fantasia:-1,crime:-1,guerra:-1,poderes:-1,superheroi:-1,magia:-1,vilao:-1,maisdeuma:1,franquia:1,classico:-1,oscar:-1,longo:-1,espaco:-1,sobrenatural:-1,naohuman:-1,muitosprot:-1,protmulher:1,antiheroi:-1,orfao:-1,familia:-1,amizade:1,finaltriste:-1,reviravolta:-1,sobrevive:1,viagemtempo:-1,baseadofatos:-1,historico:-1,distopia:-1,posapoc:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,musical:1,danca:1,esporte:-1,policial:-1,trilhafamosa:1,escola:1,mitologia:-1,survival:-1,vinganca:-1,adaptacao:-1}},
  {id:'t025',tmdb:2649,  nome:'A Bruxa de Blair',                nomeOriginal:'The Blair Witch Project',    tipo:'movie', raridade:'raro',  capa:'https://image.tmdb.org/t/p/w500/9z0C4j4NEJ4bEfVaJXSHgHAMhbZ.jpg', sinopse:'Três estudantes de cinema entram na floresta de Burkittsville para documentar a lenda da Bruxa de Blair. No terceiro dia desaparecem. Um ano depois, suas filmagens são encontradas.', tags:{filme:1,animacao:-1,anime:-1,pos2010:-1,ante2000:1,americano:1,japao:-1,brasil:-1,mexico:-1,adulto:1,infantil:-1,criancas:-1,acao:-1,terror:1,comedia:-1,romance:-1,scifi:-1,fantasia:-1,crime:-1,guerra:-1,poderes:-1,superheroi:-1,magia:1,vilao:1,maisdeuma:1,franquia:1,classico:1,oscar:-1,longo:-1,espaco:-1,sobrenatural:1,naohuman:1,muitosprot:-1,protmulher:1,antiheroi:-1,orfao:-1,familia:-1,amizade:-1,finaltriste:1,reviravolta:1,sobrevive:-1,viagemtempo:-1,baseadofatos:-1,historico:-1,distopia:-1,posapoc:-1,robos:-1,zumbi:-1,vampiro:-1,espiao:-1,musical:-1,danca:-1,esporte:-1,policial:-1,trilhafamosa:-1,escola:-1,mitologia:-1,survival:1,vinganca:-1,adaptacao:-1}}
];

// ============================================================
// PERGUNTAS FIXAS BASE
// ============================================================
const PERGUNTAS_BASE = [
  {id:'filme',txt:'É um filme (não uma série)?'},
  {id:'animacao',txt:'É animação (desenho animado)?'},
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
  {id:'classico',txt:'É considerado um grande clássico?'},
  {id:'oscar',txt:'Ganhou ou foi indicado ao Oscar?'},
  {id:'espaco',txt:'A história acontece no espaço?'},
  {id:'sobrenatural',txt:'Tem elementos sobrenaturais?'},
  {id:'protmulher',txt:'A protagonista principal é mulher?'},
  {id:'orfao',txt:'O protagonista é órfão ou perdeu os pais?'},
  {id:'familia',txt:'A família é tema central?'},
  {id:'amizade',txt:'A amizade é tema central?'},
  {id:'finaltriste',txt:'O final é triste ou ambíguo?'},
  {id:'viagemtempo',txt:'Envolve viagem no tempo?'},
  {id:'baseadofatos',txt:'É baseado em fatos reais?'},
  {id:'musical',txt:'É um musical com personagens cantando?'},
  {id:'escola',txt:'Se passa principalmente numa escola?'},
  {id:'survival',txt:'Envolve sobrevivência extrema?'},
  {id:'vinganca',txt:'A vingança é motivação principal?'},
];

// ============================================================
// INIT — carrega banco do GitHub ou usa inicial
// ============================================================
async function initTitulos() {
  // Tenta carregar do GitHub primeiro
  if (GH_TOKEN) {
    const titulosGH = await carregarDoGitHub('titulos.json');
    if (titulosGH && titulosGH.titulos && titulosGH.titulos.length > 0) {
      // Só substitui se o GitHub tiver MAIS títulos
      const local = lerTitulos();
      if (titulosGH.titulos.length >= local.titulos.length) {
        salvarSeguro(TITULOS_PATH, titulosGH);
        console.log('✅ Banco do GitHub:', titulosGH.titulos.length, 'títulos');
      }
    }
    const pergsGH = await carregarDoGitHub('perguntas.json');
    if (pergsGH && pergsGH.perguntas && pergsGH.perguntas.length > 0) {
      const localP = lerPergs();
      if (pergsGH.perguntas.length >= localP.perguntas.length) {
        salvarSeguro(PERGS_PATH, pergsGH);
        console.log('✅ Perguntas do GitHub:', pergsGH.perguntas.length);
      }
    }
  }
  const d = lerTitulos();
  if (d.titulos.length === 0) {
    d.titulos = TITULOS_INICIAIS;
    salvarTitulos(d);
    console.log('Banco inicial:', TITULOS_INICIAIS.length, 'títulos');
  } else {
    console.log('Banco local:', d.titulos.length, 'títulos');
  }
  ultimoTotalTitulos = lerTitulos().titulos.length;
  ultimoTotalPergs = lerPergs().perguntas.length;
}

// ============================================================
// AUTH
// ============================================================
app.post('/api/login', (req, res) => {
  const { username } = req.body;
  if (!username) return res.json({ erro: 'Digite um apelido!' });
  const db = lerDB();
  const user = db.usuarios.find(u => u.username === username);
  if (!user) return res.json({ erro: 'Usuário não encontrado!' });
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
// BANCO E PERGUNTAS
// ============================================================
app.get('/api/titulos', (req, res) => {
  const d = lerTitulos();
  res.json({ titulos: d.titulos, total: d.titulos.length });
});

app.get('/api/perguntas', (req, res) => {
  const dinamicas = lerPergs();
  const idsBase = new Set(PERGUNTAS_BASE.map(p => p.id));
  const extras = (dinamicas.perguntas || []).filter(p => !idsBase.has(p.id));
  res.json([...PERGUNTAS_BASE, ...extras]);
});

// ============================================================
// SISTEMA DE JOGO IA — ROTA PRINCIPAL
// ============================================================

function BANCO_TAMANHO() {
  try { return lerTitulos().titulos.length; } catch { return 0; }
}

app.post('/api/jogo/pergunta', async (req, res) => {
  const { respostas } = req.body;
  const feitas = new Set((respostas || []).map(r => r.id));
  const num = (respostas || []).length;

  // ============================================================
  // BLOCO 1 — 5 perguntas de TIPO E FORMATO
  // ============================================================
  const BLOCO1 = [
    {id:'filme',     txt:'É um filme (não uma série)?'},
    {id:'animacao',  txt:'É animação ou desenho animado?'},
    {id:'pos2010',   txt:'Foi lançado depois de 2010?'},
    {id:'infantil',  txt:'É voltado para crianças ou adolescentes?'},
    {id:'americano', txt:'É produção americana (EUA)?'},
  ];

  // ============================================================
  // BLOCO 2 — 5 perguntas de GÊNERO
  // Adapta baseado nas respostas do bloco 1
  // ============================================================
  function gerarBloco2(resps) {
    const sim = id => resps.find(r => r.id === id && r.resposta >= 0.5);
    const nao = id => resps.find(r => r.id === id && r.resposta <= -0.5);
    const pergs = [];

    // Se é animação japonesa → pergunta sobre anime especificamente
    if (sim('animacao') && !nao('anime')) pergs.push({id:'anime', txt:'É anime japonês?'});
    else if (!sim('animacao')) pergs.push({id:'anime', txt:'É anime japonês?'});

    // Gênero principal baseado no contexto
    if (!sim('infantil')) pergs.push({id:'adulto', txt:'É voltado exclusivamente para adultos?'});
    pergs.push({id:'fantasia', txt:'Tem elementos de fantasia ou magia?'});
    pergs.push({id:'acao',     txt:'É de ação ou aventura?'});
    
    // Terror só se não for infantil
    if (!sim('infantil')) pergs.push({id:'terror', txt:'É terror ou suspense psicológico?'});
    else pergs.push({id:'comedia', txt:'É comédia com muito humor?'});

    return pergs;
  }

  // ============================================================
  // BLOCO 3 — 5 perguntas de CARACTERÍSTICAS
  // ============================================================
  function gerarBloco3(resps) {
    const sim = id => resps.find(r => r.id === id && r.resposta >= 0.5);
    const pergs = [];

    pergs.push({id:'poderes',    txt:'O protagonista tem poderes especiais ou sobrenaturais?'});
    pergs.push({id:'protmulher', txt:'A protagonista principal é mulher?'});
    pergs.push({id:'maisdeuma',  txt:'Tem mais de uma temporada ou sequência?'});
    
    if (sim('fantasia') || sim('acao')) {
      pergs.push({id:'superheroi', txt:'Tem super-heróis com traje ou fantasia?'});
    } else {
      pergs.push({id:'classico', txt:'É considerado um grande clássico?'});
    }
    
    pergs.push({id:'vilao', txt:'Tem um vilão muito marcante e famoso?'});

    return pergs;
  }

  // Verifica qual bloco está
  const proxB1 = BLOCO1.find(p => !feitas.has(p.id));
  if (proxB1) {
    return res.json({ pergunta: proxB1, fase: 1, bloco: 'Tipo e Formato', num: BLOCO1.indexOf(proxB1)+1, total: 15 });
  }

  const bloco2 = gerarBloco2(respostas || []);
  const proxB2 = bloco2.find(p => !feitas.has(p.id));
  if (proxB2) {
    return res.json({ pergunta: proxB2, fase: 2, bloco: 'Gênero', num: 5+bloco2.indexOf(proxB2)+1, total: 15 });
  }

  const bloco3 = gerarBloco3(respostas || []);
  const proxB3 = bloco3.find(p => !feitas.has(p.id));
  if (proxB3) {
    return res.json({ pergunta: proxB3, fase: 3, bloco: 'Características', num: 10+bloco3.indexOf(proxB3)+1, total: 15 });
  }

  // ============================================================
  // FASE IA — 15 perguntas inteligentes com fallback automático
  // ============================================================
  const candidatos = await buscarCandidatosTMDB(respostas || []);

  // Prompt CURTO — evita timeout por contexto longo
  const ultimas8 = (respostas||[]).slice(-8);
  const historicoCurto = ultimas8
    .map(r => `${r.txt.slice(0,35).replace(/"/g,"'")}: ${r.resposta>=0.5?'SIM':r.resposta<=-0.5?'NAO':'?'}`)
    .join(' | ');
  const nomesCands = candidatos.slice(0,5).map(c=>c.nome).join(', ');
  const idsRecentes = [...feitas].slice(-8).join(',');

  const prompt = `Adivinha filme/serie. Candidatos: ${nomesCands||'varios'}. Respostas: ${historicoCurto}. IDs usados: ${idsRecentes}. Crie 1 pergunta SIM/NAO especifica. JSON: {"id":"snake_id","txt":"Pergunta?"}`;

  console.log('[IA] Chamando. Candidatos:' + candidatos.length + ' Prompt:' + prompt.length + 'chars');

    // Helper com timeout de 8s para não travar
  async function fetchComTimeout(url, opts, ms=8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      const r = await fetch(url, { ...opts, signal: controller.signal });
      clearTimeout(timer);
      return r;
    } catch(e) {
      clearTimeout(timer);
      throw e;
    }
  }

  if (!OR_KEY) {
    // Sem IA: vai direto para revelar
    return res.json({ pergunta: null, revelar: true });
  }

  // Tenta OpenRouter → fallback Llama
  const modelos = [OR_MODEL, 'meta-llama/llama-3.2-3b-instruct:free'];
  
  for (const modelo of modelos) {
    try {
      const r = await fetchComTimeout('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${OR_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://darkinatror.up.railway.app' },
        body: JSON.stringify({ model: modelo, max_tokens: 80, messages: [{ role: 'user', content: prompt }] })
      }, 15000);
      
      const d = await r.json();
      const txt = d.choices?.[0]?.message?.content || '';
      console.log('[IA] Modelo:', modelo, '| Status:', r.status, '| Resposta bruta:', txt.slice(0,150));
      const match = txt.match(/\{[\s\S]*?\}/);
      if (match) {
        const perg = JSON.parse(match[0]);
        console.log('[IA] Resposta:', JSON.stringify(perg));
        
        if (perg.id && perg.txt) {
          // Sanitiza o id: remove acentos, espaços, caracteres especiais
          const idLimpo = perg.id
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
            .replace(/[^a-z0-9_]/g, '_') // substitui caracteres inválidos por _
            .replace(/__+/g, '_') // remove underscores duplos
            .slice(0, 40); // limita tamanho
          
          if (idLimpo && !feitas.has(idLimpo)) {
            perg.id = idLimpo;
            return res.json({ pergunta: perg, fase: 4, bloco: 'IA', candidatos: candidatos.length, num: num+1, total: 30 });
          } else {
            console.log('[IA] ID repetido ou inválido:', idLimpo, '- tentando próximo modelo');
          }
        }
      } else {
        console.log('[IA] JSON não encontrado na resposta:', txt.slice(0,100));
      }
    } catch(e) { 
      console.log('IA falhou (' + modelo + '):', e.message);
      continue; 
    }
  }

  // Todas as IAs falharam — vai direto para revelar o título
  console.log('[IA] Todas falharam, revelando título');
  res.json({ pergunta: null, revelar: true, candidatos: candidatos.length });
});


// ============================================================
// BUSCA CANDIDATOS NO TMDB BASEADO NAS RESPOSTAS
// ============================================================
async function buscarCandidatosTMDB(respostas) {
  try {
    const r = respostas || [];
    const sim = (id) => r.find(x => x.id === id && x.resposta > 0);
    const nao = (id) => r.find(x => x.id === id && x.resposta < 0);

    const params = new URLSearchParams();
    params.set('api_key', TMDB_KEY);
    params.set('language', 'pt-BR');
    params.set('page', '1');
    params.set('sort_by', 'popularity.desc');

    // Filtros por tipo
    let endpoint = 'discover/multi';
    if (sim('filme') && !sim('animacao') && !sim('anime')) endpoint = 'discover/movie';
    else if (nao('filme')) endpoint = 'discover/tv';
    else endpoint = 'discover/movie';

    // Gêneros
    const generos = [];
    if (sim('animacao') || sim('anime')) generos.push(16);
    if (sim('terror')) generos.push(27);
    if (sim('comedia')) generos.push(35);
    if (sim('romance')) generos.push(10749);
    if (sim('scifi')) generos.push(878);
    if (sim('crime')) generos.push(80);
    if (sim('guerra')) generos.push(10752);
    if (sim('musical')) generos.push(10402);
    if (generos.length > 0) params.set('with_genres', generos.join(','));

    // Idioma original
    if (sim('anime') || sim('japao')) params.set('with_original_language', 'ja');
    else if (sim('americano')) params.set('with_original_language', 'en');
    else if (sim('brasil')) params.set('with_original_language', 'pt');
    else if (sim('mexico')) params.set('with_original_language', 'es');

    const url = `https://api.themoviedb.org/3/${endpoint}?${params.toString()}`;
    const resp = await fetch(url);
    const data = await resp.json();

    return (data.results || []).slice(0, 10).map(item => ({
      tmdb: item.id,
      nome: item.title || item.name || '',
      capa: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : '',
      sinopse: item.overview || '',
      tipo: item.media_type || (item.title ? 'movie' : 'tv')
    }));
  } catch(e) {
    return [];
  }
}

// ============================================================
// REVELAR RESULTADO — IA analisa e decide o título
// ============================================================
app.post('/api/jogo/revelar', async (req, res) => {
  const { respostas } = req.body;

  try {
    // Busca candidatos no TMDB
    const candidatos = await buscarCandidatosTMDB(respostas || []);

    // Banco local como candidatos adicionais
    const bancoLocal = lerTitulos().titulos;

    if (!OR_KEY || candidatos.length === 0) {
      // Fallback: usa banco local com pontuação
      const resultado = adivinharPeloBanco(respostas || [], bancoLocal);
      return res.json({ titulo: resultado, fonte: 'banco_local' });
    }

    // OpenRouter decide qual é o título
    const historico = (respostas || []).map(r => `"${r.txt}" → ${r.resposta > 0.3 ? 'SIM' : r.resposta < -0.3 ? 'NÃO' : 'TALVEZ'}`).join('\n');
    const listaCandidatos = candidatos.slice(0, 8).map((c, i) => `${i+1}. ${c.nome} (${c.tipo}): ${c.sinopse.slice(0, 100)}`).join('\n');

    const prompt = `Você é o DarkiNator. Com base nas respostas do jogador, identifique qual título ele está pensando.

Respostas do jogador:
${historico}

Candidatos possíveis:
${listaCandidatos}

Qual é o título? Responda SOMENTE com JSON:
{"numero": 1, "nome": "Nome do título", "certeza": 85}
(numero = posição na lista acima, certeza = % de confiança)`;

    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OR_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://darkinatror.up.railway.app'
      },
      body: JSON.stringify({ model: OR_MODEL, max_tokens: 100, messages: [{ role: 'user', content: prompt }] })
    });

    const rd = await resp.json();
    const txt = rd.choices?.[0]?.message?.content || '';
    const match = txt.match(/\{[\s\S]*?\}/);

    if (match) {
      const decisao = JSON.parse(match[0]);
      const idx = (decisao.numero || 1) - 1;
      const candidatoEscolhido = candidatos[idx] || candidatos[0];

      if (candidatoEscolhido) {
        // Adiciona ao banco se não existe
        adicionarAoBancoSeNovo(candidatoEscolhido, respostas || []);

        return res.json({
          titulo: {
            ...candidatoEscolhido,
            raridade: 'medio',
            certeza: decisao.certeza || 75
          },
          fonte: 'ia_tmdb'
        });
      }
    }

    // Fallback banco local
    const resultado = adivinharPeloBanco(respostas || [], bancoLocal);
    res.json({ titulo: resultado, fonte: 'banco_local' });

  } catch(e) {
    console.log('Erro revelar:', e.message);
    const bancoLocal = lerTitulos().titulos;
    const resultado = adivinharPeloBanco(respostas || [], bancoLocal);
    res.json({ titulo: resultado, fonte: 'banco_local', erro: e.message });
  }
});

// Adivinha pelo banco local (fallback)
function adivinharPeloBanco(respostas, banco) {
  const scores = banco.map((t, i) => {
    let s = 0;
    for (const r of respostas) {
      const p = t.tags?.[r.id] || 0;
      s += p * r.resposta;
    }
    return { i, s };
  }).sort((a, b) => b.s - a.s);

  const melhor = banco[scores[0]?.i];
  if (!melhor) return null;
  return { ...melhor, certeza: 60 };
}

// Adiciona título ao banco se não existe ainda
async function adicionarAoBancoSeNovo(candidato, respostas) {
  try {
    const titulos = lerTitulos();
    if (titulos.titulos.find(t => t.tmdb === candidato.tmdb)) return;

    // Gera tags baseadas nas respostas do jogo
    const tags = {};
    PERGUNTAS_BASE.forEach(p => { tags[p.id] = 0; });
    for (const r of respostas) {
      if (r.id && r.resposta !== undefined) tags[r.id] = r.resposta > 0 ? 1 : r.resposta < 0 ? -1 : 0;
    }

    const novoTitulo = {
      id: 't' + Date.now(),
      tmdb: candidato.tmdb,
      nome: candidato.nome,
      nomeOriginal: candidato.nome,
      tipo: candidato.tipo || 'movie',
      raridade: 'medio',
      capa: candidato.capa || '',
      sinopse: candidato.sinopse || '',
      tags
    };

    titulos.titulos.push(novoTitulo);
    salvarTitulos(titulos);
    console.log('✅ Auto-adicionado:', candidato.nome, '| Total:', titulos.titulos.length);

    // Salva perguntas do jogo no banco
    salvarPerguntasDoJogo(respostas, candidato.nome);

    // Salva no GitHub
    salvarNoGitHub('titulos.json', titulos).catch(() => {});

    // Gera perguntas específicas se tem OpenRouter
    if (OR_KEY && candidato.sinopse) {
      gerarPerguntasEspecificas(candidato.nome, candidato.sinopse, tags).catch(() => {});
    }
  } catch(e) { console.log('Erro auto-adicionar:', e.message); }
}

// Salva perguntas geradas durante o jogo no banco permanente
function salvarPerguntasDoJogo(respostas, nomeTitle) {
  try {
    const pergs = lerPergs();
    const idsExistentes = new Set([
      ...PERGUNTAS_BASE.map(p => p.id),
      ...(pergs.perguntas || []).map(p => p.id)
    ]);
    let adicionadas = 0;
    for (const r of (respostas || [])) {
      if (!r.id || !r.txt) continue;
      if (idsExistentes.has(r.id)) continue;
      if (!/^[a-z0-9_]+$/.test(r.id)) continue;
      pergs.perguntas.push({
        id: r.id,
        txt: r.txt,
        titulo: nomeTitle,
        resposta: r.resposta > 0 ? 1 : -1,
        geradoEm: new Date().toISOString()
      });
      idsExistentes.add(r.id);
      adicionadas++;
    }
    if (adicionadas > 0) {
      salvarPergs(pergs);
      salvarNoGitHub('perguntas.json', pergs).catch(() => {});
      console.log(`💬 ${adicionadas} perguntas salvas do jogo para: ${nomeTitle}`);
    }
  } catch(e) {}
}

// ============================================================
// SUGERIR TÍTULO MANUAL
// ============================================================
app.post('/api/sugerir', async (req, res) => {
  const { nome, username } = req.body;
  if (!nome || nome.trim().length < 2) return res.json({ erro: 'Nome inválido!' });
  res.json({ sucesso: true, msg: `"${nome}" recebido! Processando...` });
  setImmediate(async () => {
    try {
      const titulos = lerTitulos();
      if (titulos.titulos.find(t => t.nome.toLowerCase() === nome.toLowerCase().trim())) return;
      await processarTitulo(nome.trim());
    } catch(e) { console.error('Sugestão erro:', e.message); }
  });
});

app.get('/api/fila', (req, res) => {
  const f = lerFila();
  res.json({ pendentes: f.pendentes.length, processados: f.processados.slice(-20) });
});

// ============================================================
// PROCESSAR TÍTULO VIA TMDB
// ============================================================
async function processarTitulo(nome) {
  console.log('🔄 Processando:', nome);
  try {
    const busca = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}&query=${encodeURIComponent(nome)}&language=pt-BR`);
    const bd = await busca.json();
    if (!bd.results || bd.results.length === 0) return;

    const r = bd.results[0];
    const tipo = r.media_type === 'movie' ? 'movie' : 'tv';
    const tmdbId = r.id;

    const titulos = lerTitulos();
    if (titulos.titulos.find(t => t.tmdb === tmdbId)) return;

    let nomePT = r.title || r.name || nome;
    let nomeOriginal = r.original_title || r.original_name || nome;
    let sinopse = r.overview || '';
    let generos = r.genre_ids || [];
    let capa = r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : '';

    try {
      const det = await fetch(`https://api.themoviedb.org/3/${tipo}/${tmdbId}?api_key=${TMDB_KEY}&language=pt-BR`);
      const dd = await det.json();
      if (dd.title || dd.name) nomePT = dd.title || dd.name;
      if (dd.overview && dd.overview.length > sinopse.length) sinopse = dd.overview;
      if (dd.genres) generos = dd.genres.map(g => g.id);
      if (dd.poster_path) capa = `https://image.tmdb.org/t/p/w500${dd.poster_path}`;
    } catch(e) {}

    const ano = (r.release_date || r.first_air_date || '2000').slice(0, 4);
    const pop = r.popularity || 0;
    const raridade = pop > 50 ? 'comum' : pop > 10 ? 'medio' : 'raro';
    const tags = gerarTagsPorGenero(generos, tipo, ano);

    if (OR_KEY && sinopse) {
      const tagsIA = await gerarTagsIA(nomePT, sinopse, generos, tipo, ano);
      Object.assign(tags, tagsIA);
    }

    titulos.titulos.push({ id: 't' + Date.now(), tmdb: tmdbId, nome: nomePT, nomeOriginal, tipo, raridade, capa, sinopse, tags });
    salvarTitulos(titulos);
    console.log('✅ Adicionado:', nomePT, '| Total:', titulos.titulos.length);

    salvarNoGitHub('titulos.json', titulos).catch(() => {});
    if (OR_KEY && sinopse) gerarPerguntasEspecificas(nomePT, sinopse, tags).catch(() => {});

  } catch(e) { console.error('Erro processando:', nome, e.message); }
}

function gerarTagsPorGenero(generos, tipo, ano) {
  const tags = {};
  PERGUNTAS_BASE.forEach(p => { tags[p.id] = 0; });
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
  if (generos.includes(10765)) { tags.fantasia = 1; tags.scifi = 1; }
  if (generos.includes(10762)) tags.infantil = 1;
  tags.filme = tipo === 'movie' ? 1 : -1;
  tags.pos2010 = parseInt(ano) >= 2010 ? 1 : -1;
  tags.ante2000 = parseInt(ano) < 2000 ? 1 : -1;
  return tags;
}

async function gerarTagsIA(nome, sinopse, generos, tipo, ano) {
  if (!OR_KEY) return {};
  try {
    const prompt = `Título: "${nome}" (${tipo}, ${ano}). Sinopse: ${sinopse.slice(0, 300)}
Responda SOMENTE com JSON (1=sim,-1=não,0=incerto):
{"poderes":0,"vilao":0,"finaltriste":0,"criancas":0,"espaco":0,"antiheroi":0,"trilhafamosa":0,"sobrevive":0,"viagemtempo":0,"maisdeuma":0,"anime":0,"superheroi":0,"amizade":0,"naohuman":0,"classico":0,"muitosprot":0,"posapoc":0,"protmulher":0,"mexico":0,"brasil":0,"japao":0,"americano":0,"infantil":0,"orfao":0,"familia":0,"vinganca":0,"survival":0,"distopia":0,"robos":0,"zumbi":0,"vampiro":0,"espiao":0,"escola":0,"mitologia":0,"oscar":0,"longo":0,"adaptacao":0,"franquia":0,"baseadofatos":0,"historico":0,"reviravolta":0}`;
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OR_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://darkinatror.up.railway.app' },
      body: JSON.stringify({ model: OR_MODEL, max_tokens: 400, messages: [{ role: 'user', content: prompt }] })
    });
    const rd = await resp.json();
    const txt = rd.choices?.[0]?.message?.content || '';
    const match = txt.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch(e) {}
  return {};
}

async function gerarPerguntasEspecificas(nome, sinopse, tags) {
  if (!OR_KEY) return;
  try {
    const tagsAtivas = Object.entries(tags || {}).filter(([,v]) => v === 1).map(([k]) => k).join(', ');
    const prompt = `Jogo de adivinhação. Título: "${nome}". Sinopse: ${sinopse.slice(0, 200)}. Tags: ${tagsAtivas}.
Crie 5 perguntas SIM/NÃO ultra específicas só para este título.
JSON array:
[{"id":"snake_id","txt":"Pergunta?","resposta":1}]`;
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OR_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://darkinatror.up.railway.app' },
      body: JSON.stringify({ model: OR_MODEL, max_tokens: 500, messages: [{ role: 'user', content: prompt }] })
    });
    const rd = await resp.json();
    const txt = rd.choices?.[0]?.message?.content || '';
    const match = txt.match(/\[[\s\S]*\]/);
    if (!match) return;
    const novas = JSON.parse(match[0]);
    const pergs = lerPergs();
    const ids = new Set([...PERGUNTAS_BASE.map(p=>p.id), ...(pergs.perguntas||[]).map(p=>p.id)]);
    let add = 0;
    for (const p of novas) {
      if (!p.id || !p.txt || ids.has(p.id) || !/^[a-z0-9_]+$/.test(p.id)) continue;
      pergs.perguntas.push({ id: p.id, txt: p.txt, titulo: nome, resposta: p.resposta||1, geradoEm: new Date().toISOString() });
      ids.add(p.id); add++;
      // Adiciona tag ao título
      const t = lerTitulos();
      const titulo = t.titulos.find(x => x.nome === nome);
      if (titulo) { titulo.tags[p.id] = p.resposta||1; salvarTitulos(t); }
    }
    if (add > 0) { salvarPergs(pergs); console.log(`💬 ${add} perguntas para: ${nome}`); }
  } catch(e) {}
}

// ============================================================
// RESULTADO DO JOGO
// ============================================================
app.post('/api/resultado', (req, res) => {
  const { username, tituloId, nome, raridade, pontos, capa, acertou } = req.body;
  const db = lerDB();
  const user = db.usuarios.find(u => u.username === username);
  if (user) {
    user.pontos = (user.pontos||0) + pontos;
    user.jogos = (user.jogos||0) + 1;
    if (acertou) user.acertos = (user.acertos||0) + 1;
  }
  let entry = db.resultados.find(r => r.tituloId === tituloId);
  if (!entry) { entry = { tituloId, nome, raridade, jogos:0, acertos:0, capa:capa||'' }; db.resultados.push(entry); }
  entry.jogos++; if (acertou) entry.acertos++;
  if (capa && !entry.capa) entry.capa = capa;
  salvarDB(db);
  res.json({ sucesso: true });
});

// ============================================================
// MÚSICA — Deezer com score inteligente + nome original
// ============================================================
app.get('/api/musica', async (req, res) => {
  const nomePT = req.query.q || '';
  const nomeOrig = req.query.original || nomePT;
  if (!nomePT) return res.json({ erro: 'Informe q' });

  // Se tem OpenRouter, pede o nome exato da abertura
  let nomeAbertura = nomeOrig;
  if (OR_KEY) {
    try {
      const prompt = `Qual é o nome EXATO da música tema/abertura de "${nomePT}" (também conhecido como "${nomeOrig}")?
Responda SOMENTE com o nome da música em inglês ou no idioma original. Sem explicação.
Exemplo: "Guren no Yumiya" ou "Can You Tell Me How to Get to Sesame Street"`;
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${OR_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://darkinatror.up.railway.app' },
        body: JSON.stringify({ model: OR_MODEL, max_tokens: 60, messages: [{ role: 'user', content: prompt }] })
      });
      const rd = await resp.json();
      const nomeSugerido = rd.choices?.[0]?.message?.content?.trim();
      if (nomeSugerido && nomeSugerido.length < 100) nomeAbertura = nomeSugerido;
    } catch(e) {}
  }

  function score(track, ref) {
    let s = 0;
    const titulo = (track.title||'').toLowerCase();
    const album = (track.album?.title||'').toLowerCase();
    const r = ref.toLowerCase();
    if (titulo.includes(r)) s += 100;
    if (album.includes(r)) s += 60;
    if (titulo.includes('theme')||titulo.includes('opening')||titulo.includes('ost')) s += 30;
    if (titulo.includes('cover')||titulo.includes('remix')||titulo.includes('karaoke')) s -= 60;
    if (track.preview) s += 15;
    return s;
  }

  const tentativas = [
    { q: nomeAbertura, ref: nomeAbertura },
    { q: `${nomeOrig} theme`, ref: nomeOrig },
    { q: `${nomeOrig} opening`, ref: nomeOrig },
    { q: `${nomeOrig} soundtrack`, ref: nomeOrig },
    { q: `${nomePT} trilha sonora`, ref: nomePT },
  ];

  let melhor = null, melhorScore = -999;
  for (const { q, ref } of tentativas) {
    try {
      const r = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=10`);
      const d = await r.json();
      for (const t of (d.data||[])) {
        if (!t.preview) continue;
        const s = score(t, ref);
        if (s > melhorScore) { melhorScore = s; melhor = t; }
      }
      if (melhorScore >= 80) break;
    } catch(e) { continue; }
  }

  if (!melhor) return res.json({ erro: 'Trilha não encontrada' });
  res.json({ titulo: melhor.title, artista: melhor.artist?.name||'', preview: melhor.preview, capa: melhor.album?.cover_medium||'' });
});

// ============================================================
// EXPANSÃO AUTOMÁTICA
// ============================================================
let expansaoRodando = false;
async function expandirBanco() {
  if (expansaoRodando) return;
  expansaoRodando = true;
  const titulos = lerTitulos();
  const hoje = new Date().toDateString();
  if (titulos.ultimaExpansao === hoje && (titulos.expansaoHoje||0) >= 250) { expansaoRodando = false; return; }
  if (titulos.ultimaExpansao !== hoje) { titulos.expansaoHoje = 0; titulos.ultimaExpansao = hoje; salvarTitulos(titulos); }
  console.log('🔄 Expandindo... Total:', titulos.titulos.length);
  const p = Math.floor(Math.random()*15)+1;
  const urls = [
    `https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_KEY}&language=pt-BR&page=${p}`,
    `https://api.themoviedb.org/3/tv/popular?api_key=${TMDB_KEY}&language=pt-BR&page=${p}`,
    `https://api.themoviedb.org/3/movie/top_rated?api_key=${TMDB_KEY}&language=pt-BR&page=${p}`,
    `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&with_genres=16&language=pt-BR&page=${Math.ceil(Math.random()*10)}`,
    `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_KEY}&with_original_language=ja&language=pt-BR&page=${Math.ceil(Math.random()*10)}`,
    `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&with_genres=27&language=pt-BR&page=${Math.ceil(Math.random()*8)}`,
    `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_KEY}&with_genres=10762&language=pt-BR&page=${Math.ceil(Math.random()*5)}`,
  ];
  for (const url of urls) {
    const t2 = lerTitulos();
    if ((t2.expansaoHoje||0) >= 250) break;
    try {
      const r = await fetch(url);
      const d = await r.json();
      for (const item of (d.results||[]).slice(0,6)) {
        const t3 = lerTitulos();
        if ((t3.expansaoHoje||0) >= 250) break;
        if (!['pt','en','es','ja'].includes(item.original_language)) continue;
        if ((item.popularity||0) < 8) continue;
        if (t3.titulos.find(x => x.tmdb === item.id)) continue;
        await processarTitulo(item.title||item.name);
        const t4 = lerTitulos();
        t4.expansaoHoje = (t4.expansaoHoje||0)+1;
        salvarTitulos(t4);
        await new Promise(r => setTimeout(r, 1200));
      }
    } catch(e) { console.error('Expansão erro:', e.message); }
  }
  expansaoRodando = false;
  const totalFinal = lerTitulos().titulos.length;
  console.log('✅ Expansão ok. Total:', totalFinal);
  await salvarNoGitHub('titulos.json', lerTitulos());
}

// ============================================================
// COMENTÁRIOS, RANKING, TOP, INFO
// ============================================================
app.get('/api/comentarios/:tituloId', (req, res) => {
  const db = lerDB();
  res.json((db.comentarios||[]).filter(c => c.tituloId === req.params.tituloId).slice(-30));
});
app.post('/api/comentario', (req, res) => {
  const { username, avatarIdx, tituloId, texto } = req.body;
  if (!texto?.trim()) return res.json({ erro: 'Texto vazio' });
  const db = lerDB();
  if (!db.comentarios) db.comentarios = [];
  db.comentarios.push({ id: uuidv4(), username, avatarIdx: avatarIdx||0, tituloId, texto: texto.trim(), data: new Date().toISOString() });
  if (db.comentarios.length > 10000) db.comentarios = db.comentarios.slice(-10000);
  salvarDB(db);
  res.json({ sucesso: true });
});
app.get('/api/ranking', (req, res) => {
  const db = lerDB();
  res.json([...db.usuarios].sort((a,b)=>(b.pontos||0)-(a.pontos||0)).slice(0,20).map(u=>{const{senha,...r}=u;return r;}));
});
app.get('/api/maisJogados', (req, res) => {
  const db = lerDB();
  res.json([...(db.resultados||[])].sort((a,b)=>(b.jogos||0)-(a.jogos||0)).slice(0,10));
});
app.get('/api/info', (req, res) => {
  const t = lerTitulos();
  const p = lerPergs();
  res.json({ totalTitulos: t.titulos.length, totalPerguntas: PERGUNTAS_BASE.length+(p.perguntas||[]).length, perguntasDinamicas: (p.perguntas||[]).length, versao: '5.0' });
});

// ============================================================
// START
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🔮 DarkiNator v5 porta ${PORT}`);
  await initTitulos();
  setTimeout(() => expandirBanco(), 20000);
  setInterval(() => expandirBanco(), 6*60*60*1000);
});
