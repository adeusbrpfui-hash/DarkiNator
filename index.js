const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const DB_PATH = path.join(__dirname, 'db.json');

function lerDB(){
  if(!fs.existsSync(DB_PATH)){
    const inicial = { usuarios:[], resultados:[], comentarios:[] };
    fs.writeFileSync(DB_PATH, JSON.stringify(inicial, null, 2));
    return inicial;
  }
  return JSON.parse(fs.readFileSync(DB_PATH,'utf8'));
}
function salvarDB(d){ fs.writeFileSync(DB_PATH, JSON.stringify(d, null, 2)); }

app.post('/api/login', (req, res) => {
  const { username } = req.body;
  if(!username) return res.json({erro:'Digite um apelido!'});
  const db = lerDB();
  let user = db.usuarios.find(u => u.username === username);
  if(!user) return res.json({erro:'Usuário não encontrado. Crie uma conta!'});
  res.json({sucesso:true, usuario:user});
});

app.post('/api/cadastro', (req, res) => {
  const { username, senha, avatarIdx } = req.body;
  if(!username) return res.json({erro:'Digite um apelido!'});
  if(!senha || senha.length !== 4) return res.json({erro:'Senha deve ter 4 dígitos!'});
  const db = lerDB();
  if(db.usuarios.find(u => u.username === username)) return res.json({erro:'Apelido já existe!'});
  const user = {
    id: uuidv4(), username, senha,
    avatarIdx: avatarIdx||0,
    pontos:0, jogos:0, acertos:0,
    criado: new Date().toISOString()
  };
  db.usuarios.push(user);
  salvarDB(db);
  res.json({sucesso:true, usuario:user});
});

app.get('/api/tmdb/:id', async (req, res) => {
  try{
    const fetch = (await import('node-fetch')).default;
    const id = req.params.id;
    let r = await fetch(`https://api.themoviedb.org/3/movie/${id}?api_key=8265bd1679663a7ea12ac168da84d2e8&language=pt-BR`);
    let d = await r.json();
    if(d.id){ return res.json(d); }
    r = await fetch(`https://api.themoviedb.org/3/tv/${id}?api_key=8265bd1679663a7ea12ac168da84d2e8&language=pt-BR`);
    d = await r.json();
    res.json(d);
  }catch(e){ res.json({}); }
});

app.post('/api/resultado', (req, res) => {
  const { username, tmdbId, nome, raridade, pontos } = req.body;
  const db = lerDB();
  const user = db.usuarios.find(u => u.username === username);
  if(user){
    user.pontos = (user.pontos||0) + pontos;
    user.jogos = (user.jogos||0) + 1;
  }
  let entry = db.resultados.find(r => r.tmdbId === tmdbId);
  if(!entry){ entry = { tmdbId, nome, raridade, jogos:0, acertos:0, capa:'' }; db.resultados.push(entry); }
  entry.jogos++;
  salvarDB(db);
  res.json({sucesso:true});
});

app.post('/api/acerto', (req, res) => {
  const { username, tmdbId } = req.body;
  const db = lerDB();
  const user = db.usuarios.find(u => u.username === username);
  if(user) user.acertos = (user.acertos||0) + 1;
  const entry = db.resultados.find(r => r.tmdbId === tmdbId);
  if(entry) entry.acertos++;
  salvarDB(db);
  res.json({sucesso:true});
});

app.get('/api/comentarios/:tmdbId', (req, res) => {
  const db = lerDB();
  const coms = (db.comentarios||[]).filter(c => c.tmdbId == req.params.tmdbId);
  res.json(coms.slice(-30).reverse());
});

app.post('/api/comentario', (req, res) => {
  const { username, avatarIdx, tmdbId, texto } = req.body;
  if(!texto) return res.json({erro:'Texto vazio'});
  const db = lerDB();
  if(!db.comentarios) db.comentarios = [];
  const com = { id:uuidv4(), username, avatarIdx:avatarIdx||0, tmdbId, texto, data:new Date().toISOString() };
  db.comentarios.push(com);
  salvarDB(db);
  res.json({sucesso:true, comentario:com});
});

app.get('/api/ranking', (req, res) => {
  const db = lerDB();
  const rank = [...db.usuarios]
    .sort((a,b) => (b.pontos||0) - (a.pontos||0))
    .slice(0, 20)
    .map(u => { const {senha,...rest}=u; return rest; });
  res.json(rank);
});

app.get('/api/maisJogados', async (req, res) => {
  const db = lerDB();
  const lista = [...(db.resultados||[])].sort((a,b) => (b.jogos||0) - (a.jogos||0)).slice(0, 10);
  try{
    const fetch = (await import('node-fetch')).default;
    for(const f of lista){
      if(!f.capa && f.tmdbId){
        try{
          let r = await fetch(`https://api.themoviedb.org/3/movie/${f.tmdbId}?api_key=8265bd1679663a7ea12ac168da84d2e8`);
          let d = await r.json();
          if(d.poster_path) f.capa = `https://image.tmdb.org/t/p/w300${d.poster_path}`;
          else {
            r = await fetch(`https://api.themoviedb.org/3/tv/${f.tmdbId}?api_key=8265bd1679663a7ea12ac168da84d2e8`);
            d = await r.json();
            if(d.poster_path) f.capa = `https://image.tmdb.org/t/p/w300${d.poster_path}`;
          }
        }catch{}
      }
    }
  }catch{}
  res.json(lista);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🔮 DarkiNator rodando na porta ${PORT}`));
