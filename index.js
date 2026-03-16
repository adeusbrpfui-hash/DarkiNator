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
    const i={usuarios:[],resultados:[],comentarios:[]};
    fs.writeFileSync(DB_PATH,JSON.stringify(i,null,2)); return i;
  }
  return JSON.parse(fs.readFileSync(DB_PATH,'utf8'));
}
function salvarDB(d){fs.writeFileSync(DB_PATH,JSON.stringify(d,null,2));}

// LOGIN
app.post('/api/login',(req,res)=>{
  const{username}=req.body;
  if(!username) return res.json({erro:'Digite um apelido!'});
  const db=lerDB();
  const user=db.usuarios.find(u=>u.username===username);
  if(!user) return res.json({erro:'Usuário não encontrado. Crie uma conta!'});
  res.json({sucesso:true,usuario:user});
});

// CADASTRO
app.post('/api/cadastro',(req,res)=>{
  const{username,senha,avatarIdx}=req.body;
  if(!username) return res.json({erro:'Digite um apelido!'});
  if(!senha||senha.length!==4) return res.json({erro:'Senha deve ter 4 dígitos!'});
  const db=lerDB();
  if(db.usuarios.find(u=>u.username===username)) return res.json({erro:'Apelido já existe!'});
  const user={id:uuidv4(),username,senha,avatarIdx:avatarIdx||0,pontos:0,jogos:0,acertos:0,criado:new Date().toISOString()};
  db.usuarios.push(user); salvarDB(db);
  res.json({sucesso:true,usuario:user});
});

// TMDB
app.get('/api/tmdb/:id',async(req,res)=>{
  try{
    const fetch=(await import('node-fetch')).default;
    const{id}=req.params; const tipo=req.query.tipo||'movie';
    const TMDB=process.env.TMDB_KEY||'';
    const url=`https://api.themoviedb.org/3/${tipo}/${id}?api_key=${TMDB}&language=pt-BR`;
    const r=await fetch(url); const d=await r.json();
    if(d.id) return res.json(d);
    const tipo2=tipo==='movie'?'tv':'movie';
    const r2=await fetch(`https://api.themoviedb.org/3/${tipo2}/${id}?api_key=${TMDB}&language=pt-BR`);
    res.json(await r2.json());
  }catch(e){res.json({});}
});

// SOUNDCLOUD SEARCH
app.get('/api/soundcloud',async(req,res)=>{
  try{
    const fetch=(await import('node-fetch')).default;
    const q=req.query.q||'';
    const url=`https://api.soundcloud.com/tracks?q=${q}&client_id=iZIs9mchVcX5lhVRyQNGAuEfWU60N3bM&limit=1&linked_partitioning=1`;
    const r=await fetch(url); const d=await r.json();
    if(d.collection&&d.collection.length>0&&d.collection[0].permalink_url){
      return res.json({url:d.collection[0].permalink_url,title:d.collection[0].title});
    }
    res.json({});
  }catch(e){res.json({});}
});

// YOUTUBE SEARCH (fallback)
app.get('/api/youtube',async(req,res)=>{
  try{
    const fetch=(await import('node-fetch')).default;
    const q=req.query.q||'';
    const YT=process.env.YOUTUBE_KEY||'';
    const url=`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${q}&type=video&maxResults=1&key=${YT}`;
    const r=await fetch(url); const d=await r.json();
    if(d.items&&d.items.length>0){
      return res.json({videoId:d.items[0].id.videoId,title:d.items[0].snippet.title});
    }
    res.json({});
  }catch(e){res.json({});}
});

// RESULTADO
app.post('/api/resultado',(req,res)=>{
  const{username,tmdbId,nome,raridade,pontos,capa}=req.body;
  const db=lerDB();
  const user=db.usuarios.find(u=>u.username===username);
  if(user){user.pontos=(user.pontos||0)+pontos;user.jogos=(user.jogos||0)+1;}
  let entry=db.resultados.find(r=>r.tmdbId===tmdbId);
  if(!entry){entry={tmdbId,nome,raridade,jogos:0,acertos:0,capa:capa||''};db.resultados.push(entry);}
  entry.jogos++; if(capa&&!entry.capa) entry.capa=capa;
  salvarDB(db); res.json({sucesso:true});
});

// ACERTO
app.post('/api/acerto',(req,res)=>{
  const{username,tmdbId}=req.body; const db=lerDB();
  const user=db.usuarios.find(u=>u.username===username);
  if(user) user.acertos=(user.acertos||0)+1;
  const entry=db.resultados.find(r=>r.tmdbId===tmdbId);
  if(entry) entry.acertos++;
  salvarDB(db); res.json({sucesso:true});
});

// COMENTÁRIOS
app.get('/api/comentarios/:tmdbId',(req,res)=>{
  const db=lerDB();
  const coms=(db.comentarios||[]).filter(c=>c.tmdbId==req.params.tmdbId);
  res.json(coms.slice(-30));
});
app.post('/api/comentario',(req,res)=>{
  const{username,avatarIdx,tmdbId,texto}=req.body;
  if(!texto) return res.json({erro:'Texto vazio'});
  const db=lerDB(); if(!db.comentarios)db.comentarios=[];
  const com={id:uuidv4(),username,avatarIdx:avatarIdx||0,tmdbId,texto,data:new Date().toISOString()};
  db.comentarios.push(com); salvarDB(db); res.json({sucesso:true,comentario:com});
});

// RANKING
app.get('/api/ranking',(req,res)=>{
  const db=lerDB();
  const rank=[...db.usuarios].sort((a,b)=>(b.pontos||0)-(a.pontos||0)).slice(0,20).map(u=>{const{senha,...r}=u;return r;});
  res.json(rank);
});

// MAIS JOGADOS
app.get('/api/maisJogados',async(req,res)=>{
  const db=lerDB();
  const lista=[...(db.resultados||[])].sort((a,b)=>(b.jogos||0)-(a.jogos||0)).slice(0,10);
  try{
    const fetch=(await import('node-fetch')).default;
    for(const f of lista){
      if(!f.capa&&f.tmdbId){
        try{
          const r=await fetch(`https://api.themoviedb.org/3/movie/${f.tmdbId}?api_key=${process.env.TMDB_KEY||''}`);
          const d=await r.json();
          if(d.poster_path) f.capa=`https://image.tmdb.org/t/p/w300${d.poster_path}`;
        }catch{}
      }
    }
  }catch{}
  res.json(lista);
});

const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log(`🔮 DarkiNator na porta ${PORT}`));
