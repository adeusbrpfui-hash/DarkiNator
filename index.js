<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DarkiNator</title>
<link href="https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700;900&family=Nunito:wght@400;600;700;800;900&family=Orbitron:wght@500;700;900&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#07080f;
  --card:#10131e;
  --card2:#161b2e;
  --borda:#252d45;
  --borda2:#2e3855;
  --roxo:#8b5cf6;
  --roxo2:#6d28d9;
  --roxo3:#4c1d95;
  --ouro:#fbbf24;
  --ouro2:#f59e0b;
  --prata:#94a3b8;
  --bronze:#b45309;
  --verde:#10b981;
  --vermelho:#ef4444;
  --branco:#f1f5f9;
  --cinza:#94a3b8;
  --cinza2:#64748b;
}
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{min-height:100vh}
body{background:var(--bg);color:var(--branco);font-family:'Nunito',sans-serif;overflow-x:hidden}

/* FUNDO */
body::before{
  content:'';position:fixed;inset:0;pointer-events:none;z-index:0;
  background:
    radial-gradient(600px circle at 20% 30%,rgba(139,92,246,.06),transparent),
    radial-gradient(400px circle at 80% 70%,rgba(251,191,36,.04),transparent);
}
#stars{position:fixed;inset:0;pointer-events:none;z-index:0}
.star{position:absolute;width:2px;height:2px;background:#fff;border-radius:50%;opacity:0;animation:twinkle ease-in-out infinite}
@keyframes twinkle{0%,100%{opacity:0}50%{opacity:.6}}

.hidden{display:none!important}
.tela{display:none;position:relative;z-index:1;min-height:100vh;flex-direction:column;align-items:center}
.tela.ativa{display:flex}

/* ========== CAPTCHA ========== */
#telaCaptcha{justify-content:center;padding:24px}
.captcha-card{
  background:var(--card);border:1px solid var(--borda);border-radius:24px;
  padding:40px 28px;width:100%;max-width:360px;text-align:center;
  box-shadow:0 20px 60px rgba(0,0,0,.5);animation:aparecer .5s ease
}
@keyframes aparecer{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
.cap-logo{font-family:'Cinzel Decorative',serif;font-size:22px;color:var(--roxo);margin-bottom:6px}
.cap-sub{font-size:14px;color:var(--cinza);margin-bottom:28px;line-height:1.5}
.cap-codigo{
  background:linear-gradient(135deg,rgba(139,92,246,.15),rgba(251,191,36,.08));
  border:2px solid rgba(139,92,246,.4);border-radius:14px;
  padding:22px;font-family:'Orbitron',monospace;font-size:28px;font-weight:900;
  color:var(--ouro);letter-spacing:10px;margin-bottom:22px;
  text-shadow:0 0 16px rgba(251,191,36,.3)
}
.cap-inp{
  width:100%;padding:14px;border-radius:12px;border:2px solid var(--borda2);
  background:rgba(255,255,255,.05);color:var(--branco);
  font-family:'Orbitron',monospace;font-size:20px;font-weight:700;
  text-align:center;letter-spacing:6px;outline:none;transition:.2s;
  margin-bottom:16px;text-transform:uppercase
}
.cap-inp:focus{border-color:var(--roxo);background:rgba(139,92,246,.08)}
.cap-btn{
  width:100%;padding:15px;border-radius:12px;border:none;
  background:linear-gradient(135deg,var(--roxo),var(--roxo2));
  color:#fff;font-family:'Orbitron',monospace;font-size:13px;font-weight:700;
  letter-spacing:3px;cursor:pointer;transition:.25s;
  box-shadow:0 4px 20px rgba(139,92,246,.35)
}
.cap-btn:hover{transform:translateY(-2px);box-shadow:0 8px 30px rgba(139,92,246,.5)}
.cap-err{color:var(--vermelho);font-size:13px;margin-top:10px;min-height:18px;font-weight:700}

/* ========== INTRO ========== */
#telaIntro{justify-content:center;padding:32px 24px;text-align:center;gap:0}
.intro-titulo{
  font-family:'Cinzel Decorative',serif;
  font-size:clamp(34px,10vw,64px);font-weight:900;
  background:linear-gradient(135deg,#c4b5fd 0%,var(--roxo) 40%,var(--ouro) 100%);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
  line-height:1.1;margin-bottom:8px;animation:entrar 1s ease
}
@keyframes entrar{from{opacity:0;transform:translateY(-16px)}to{opacity:1;transform:none}}
.intro-tag{
  font-family:'Orbitron',monospace;font-size:11px;color:var(--cinza2);
  letter-spacing:5px;text-transform:uppercase;margin-bottom:40px;
  animation:fadeIn 1.5s ease
}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
.genio-container{position:relative;width:160px;height:160px;margin:0 auto 36px}
.anel{position:absolute;border-radius:50%;border:2px solid transparent;animation:girar linear infinite}
.anel1{inset:-10px;border-width:2px;
  background:linear-gradient(var(--bg),var(--bg)) padding-box,
             linear-gradient(135deg,var(--roxo),var(--ouro),var(--roxo)) border-box;
  animation-duration:4s}
.anel2{inset:-22px;border-width:1px;
  background:linear-gradient(var(--bg),var(--bg)) padding-box,
             linear-gradient(135deg,rgba(139,92,246,.3),rgba(251,191,36,.3)) border-box;
  animation-duration:8s;animation-direction:reverse}
@keyframes girar{to{transform:rotate(360deg)}}
.genio-foto{
  width:160px;height:160px;border-radius:50%;object-fit:cover;display:block;
  border:3px solid var(--roxo);
  box-shadow:0 0 30px rgba(139,92,246,.4),0 0 60px rgba(139,92,246,.15);
  animation:pulsarGenio 3s ease-in-out infinite
}
@keyframes pulsarGenio{0%,100%{box-shadow:0 0 30px rgba(139,92,246,.4)}50%{box-shadow:0 0 60px rgba(139,92,246,.7),0 0 100px rgba(139,92,246,.2)}}
.intro-desc{
  max-width:300px;font-size:15px;line-height:1.75;color:var(--cinza);
  margin-bottom:40px;animation:fadeIn 2s ease
}
.btn-iniciar{
  padding:17px 50px;border-radius:14px;border:none;
  background:linear-gradient(135deg,var(--roxo),var(--roxo2));color:#fff;
  font-family:'Orbitron',monospace;font-size:14px;font-weight:700;letter-spacing:3px;
  cursor:pointer;box-shadow:0 4px 24px rgba(139,92,246,.4);transition:.3s;
  animation:fadeIn 2.5s ease
}
.btn-iniciar:hover{transform:translateY(-3px);box-shadow:0 10px 40px rgba(139,92,246,.6)}

/* ========== LOGIN ========== */
#telaLogin{justify-content:center;padding:24px}
.login-card{
  background:var(--card);border:1px solid var(--borda);border-radius:24px;
  padding:36px 24px;width:100%;max-width:360px;
  box-shadow:0 20px 60px rgba(0,0,0,.4);animation:aparecer .4s ease
}
.login-titulo{font-family:'Cinzel Decorative',serif;font-size:18px;color:var(--roxo);text-align:center;margin-bottom:4px}
.login-sub{font-size:11px;color:var(--cinza2);text-align:center;letter-spacing:3px;font-family:'Orbitron',monospace;margin-bottom:24px}
.av-label{font-size:11px;color:var(--cinza2);letter-spacing:2px;font-family:'Orbitron',monospace;margin-bottom:10px}
.avatares-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px}
.av{width:100%;aspect-ratio:1;border-radius:50%;object-fit:cover;border:3px solid transparent;cursor:pointer;transition:.2s;opacity:.5;background:var(--card2)}
.av.sel{border-color:var(--roxo);opacity:1;box-shadow:0 0 12px rgba(139,92,246,.5)}
.inp{
  width:100%;padding:13px 15px;border-radius:12px;border:2px solid var(--borda2);
  background:rgba(255,255,255,.04);color:var(--branco);
  font-size:15px;font-family:'Nunito',sans-serif;font-weight:700;outline:none;transition:.2s;margin-bottom:10px
}
.inp::placeholder{color:var(--cinza2)}
.inp:focus{border-color:var(--roxo);background:rgba(139,92,246,.06)}
.btn-prim{
  width:100%;padding:14px;border-radius:12px;border:none;
  background:linear-gradient(135deg,var(--roxo),var(--roxo2));color:#fff;
  font-family:'Orbitron',monospace;font-size:12px;font-weight:700;letter-spacing:2px;
  cursor:pointer;box-shadow:0 4px 16px rgba(139,92,246,.3);transition:.2s;margin-bottom:8px
}
.btn-prim:hover{transform:translateY(-1px);box-shadow:0 8px 28px rgba(139,92,246,.5)}
.btn-sec{
  width:100%;padding:13px;border-radius:12px;border:2px solid var(--borda2);background:transparent;
  color:var(--cinza);font-family:'Nunito',sans-serif;font-size:14px;font-weight:700;cursor:pointer;transition:.2s
}
.btn-sec:hover{border-color:var(--roxo);color:var(--roxo)}
.login-err{color:var(--vermelho);font-size:13px;font-weight:700;text-align:center;min-height:18px;margin-top:6px}

/* ========== HEADER ========== */
#header{
  position:fixed;top:0;left:0;right:0;height:56px;
  background:rgba(7,8,15,.92);backdrop-filter:blur(24px);
  border-bottom:1px solid var(--borda);
  display:flex;align-items:center;justify-content:space-between;padding:0 16px;z-index:500
}
.h-logo{font-family:'Cinzel Decorative',serif;font-size:13px;
  background:linear-gradient(135deg,var(--roxo),var(--ouro));
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.h-direita{display:flex;align-items:center;gap:10px}
.h-nick{font-size:12px;font-weight:700;color:var(--cinza);font-family:'Orbitron',monospace}
.h-av{width:34px;height:34px;border-radius:50%;object-fit:cover;border:2px solid var(--roxo);cursor:pointer;box-shadow:0 0 10px rgba(139,92,246,.3)}

/* ========== NAVBAR ========== */
#navbar{
  position:fixed;bottom:0;left:0;right:0;height:62px;
  background:rgba(7,8,15,.95);backdrop-filter:blur(24px);
  border-top:1px solid var(--borda);
  display:flex;justify-content:space-around;align-items:center;z-index:500
}
.nb{background:none;border:none;color:var(--cinza2);cursor:pointer;
  display:flex;flex-direction:column;align-items:center;gap:3px;
  font-size:8px;font-weight:800;letter-spacing:1px;padding:6px 10px;
  font-family:'Orbitron',monospace;transition:.2s}
.nb .ic{font-size:20px}
.nb.ativo{color:var(--roxo)}
.nb.ativo .ic{filter:drop-shadow(0 0 6px var(--roxo))}

/* ========== TELAS ========== */
.pg{padding:68px 16px 74px;width:100%;align-items:stretch}

/* ========== JOGO ========== */
#telaJogar{padding:68px 0 74px}
#jogarConteudo{width:100%;padding:0 16px}

.jogo-topo{text-align:center;padding:16px 0 12px}
.jogo-topo h2{font-family:'Cinzel Decorative',serif;font-size:19px;color:var(--branco);margin-bottom:4px}
.jogo-topo p{font-size:13px;color:var(--cinza);line-height:1.5}

.barra-prog{margin-bottom:16px}
.barra-info{display:flex;justify-content:space-between;font-size:10px;font-family:'Orbitron',monospace;color:var(--cinza2);margin-bottom:6px;letter-spacing:1px}
.barra{height:4px;background:var(--borda);border-radius:2px;overflow:hidden}
.barra-fill{height:100%;background:linear-gradient(90deg,var(--roxo),var(--ouro));border-radius:2px;transition:width .5s ease;box-shadow:0 0 8px rgba(139,92,246,.4)}

.pergunta-card{
  background:var(--card);border:1px solid var(--borda2);border-radius:16px;
  padding:22px;margin-bottom:14px;position:relative;overflow:hidden;
  animation:aparecer .3s ease
}
.pergunta-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--roxo),var(--ouro))}
.perg-num{font-family:'Orbitron',monospace;font-size:9px;color:var(--roxo);letter-spacing:2px;margin-bottom:10px}
.perg-txt{font-size:17px;font-weight:800;color:var(--branco);line-height:1.5}

.ops{display:flex;flex-direction:column;gap:8px}
.op{
  padding:13px 16px;border-radius:12px;border:2px solid var(--borda);
  background:var(--card);color:var(--branco);
  font-size:15px;font-weight:700;font-family:'Nunito',sans-serif;
  cursor:pointer;text-align:left;transition:.2s;
  display:flex;align-items:center;gap:10px
}
.op:hover{border-color:var(--roxo);background:rgba(139,92,246,.1);transform:translateX(4px)}
.op .op-ico{font-size:17px;width:22px;text-align:center;flex-shrink:0}

/* PENSANDO */
.pensando{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 0;gap:14px}
.spinner{width:48px;height:48px;border-radius:50%;border:3px solid var(--borda2);border-top-color:var(--roxo);animation:girar .7s linear infinite}
.pensando-txt{font-family:'Orbitron',monospace;font-size:10px;color:var(--cinza2);letter-spacing:2px;animation:piscar 1s ease-in-out infinite}
@keyframes piscar{0%,100%{opacity:.4}50%{opacity:1}}

/* ========== RESULTADO ========== */
.resultado-card{
  background:var(--card);border:1px solid var(--borda2);border-radius:20px;
  overflow:hidden;animation:aparecer .5s ease;margin-bottom:16px
}
.res-capa{width:100%;height:220px;object-fit:cover;display:block}
.res-capa-ph{width:100%;height:220px;background:linear-gradient(135deg,var(--card),var(--card2));display:flex;align-items:center;justify-content:center;font-size:60px}
.res-corpo{padding:20px}
.res-label{font-family:'Orbitron',monospace;font-size:9px;color:var(--roxo);letter-spacing:3px;margin-bottom:8px}
.res-nome{font-family:'Cinzel Decorative',serif;font-size:20px;color:var(--branco);margin-bottom:6px;line-height:1.3}
.res-meta{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;align-items:center}
.badge{
  background:rgba(139,92,246,.15);border:1px solid rgba(139,92,246,.3);
  border-radius:6px;padding:3px 9px;font-size:10px;font-family:'Orbitron',monospace;
  color:var(--roxo);font-weight:700;letter-spacing:1px
}
.res-sinopse{font-size:14px;color:var(--cinza);line-height:1.75;margin-bottom:18px}

/* PLAYER MÚSICA */
.player{
  background:rgba(255,255,255,.04);border:1px solid var(--borda2);
  border-radius:14px;overflow:hidden;margin-bottom:16px
}
.player-topo{display:flex;align-items:center;gap:12px;padding:14px}
.play-btn{
  width:42px;height:42px;border-radius:50%;border:none;flex-shrink:0;
  background:linear-gradient(135deg,var(--roxo),var(--roxo2));
  color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;
  box-shadow:0 0 14px rgba(139,92,246,.4);transition:.2s
}
.play-btn:hover{transform:scale(1.08)}
.player-info{flex:1;min-width:0}
.player-nome{font-size:13px;font-weight:800;color:var(--branco);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.player-fonte{font-size:10px;color:var(--cinza2);font-family:'Orbitron',monospace;letter-spacing:1px}
.player-barra{height:3px;background:var(--borda);margin:0 14px 12px;border-radius:2px;overflow:hidden}
.player-prog{height:100%;background:linear-gradient(90deg,var(--roxo),var(--ouro));width:0%;transition:.2s;border-radius:2px}
iframe.sc-frame{width:100%;border:none;display:none}
iframe.yt-frame{width:100%;height:0;border:none;display:none}

/* MEDALHA */
.medalha{
  display:flex;align-items:center;gap:14px;padding:16px;
  background:rgba(255,255,255,.03);border:1px solid var(--borda2);border-radius:12px;margin-bottom:16px
}
.med-ico{font-size:36px;animation:medalhaEntrar .6s ease .2s both}
@keyframes medalhaEntrar{from{opacity:0;transform:scale(0)}to{opacity:1;transform:scale(1)}}
.med-label{font-family:'Orbitron',monospace;font-size:9px;color:var(--cinza2);letter-spacing:2px;margin-bottom:4px}
.med-nome{font-size:16px;font-weight:900}
.med-pts{font-size:11px;color:var(--cinza2);font-family:'Orbitron',monospace;margin-top:2px}

.btns-resultado{display:flex;gap:8px;margin-bottom:12px}
.btn-sim{
  flex:1;padding:13px;border-radius:12px;border:none;
  background:linear-gradient(135deg,#059669,var(--verde));
  color:#fff;font-family:'Orbitron',monospace;font-size:10px;font-weight:700;letter-spacing:1px;cursor:pointer;transition:.2s
}
.btn-nao{
  flex:1;padding:13px;border-radius:12px;border:2px solid var(--vermelho);background:transparent;
  color:var(--vermelho);font-family:'Orbitron',monospace;font-size:10px;font-weight:700;letter-spacing:1px;cursor:pointer;transition:.2s
}
.btn-nao:hover{background:rgba(239,68,68,.1)}
.btn-novojogo{
  width:100%;padding:14px;border-radius:12px;border:none;
  background:linear-gradient(135deg,var(--roxo),var(--roxo2));color:#fff;
  font-family:'Orbitron',monospace;font-size:11px;font-weight:700;letter-spacing:2px;
  cursor:pointer;box-shadow:0 4px 16px rgba(139,92,246,.3);transition:.2s;margin-bottom:18px
}
.btn-novojogo:hover{transform:translateY(-1px)}

/* COMENTÁRIOS */
.coms{border-top:1px solid var(--borda);padding-top:16px}
.coms-titulo{font-family:'Orbitron',monospace;font-size:10px;color:var(--cinza2);letter-spacing:2px;margin-bottom:12px}
.coms-lista{display:flex;flex-direction:column;gap:8px;margin-bottom:12px;max-height:190px;overflow-y:auto}
.com{display:flex;gap:8px}
.com-av{width:30px;height:30px;border-radius:50%;object-fit:cover;background:var(--card2);flex-shrink:0;border:2px solid var(--borda)}
.com-balao{background:var(--card2);border:1px solid var(--borda);border-radius:10px;padding:8px 12px;flex:1}
.com-nick{font-size:10px;font-weight:800;color:var(--roxo);margin-bottom:3px;font-family:'Orbitron',monospace}
.com-texto{font-size:13px;color:var(--branco);line-height:1.4}
.com-linha{display:flex;gap:8px}
.com-inp{
  flex:1;padding:10px 13px;border-radius:10px;border:2px solid var(--borda2);
  background:rgba(255,255,255,.04);color:var(--branco);
  font-size:13px;font-family:'Nunito',sans-serif;font-weight:700;outline:none;transition:.2s
}
.com-inp::placeholder{color:var(--cinza2)}
.com-inp:focus{border-color:var(--roxo)}
.com-enviar{padding:10px 16px;border-radius:10px;border:none;background:var(--roxo);color:#fff;font-size:16px;font-weight:700;cursor:pointer;transition:.2s}
.com-enviar:hover{background:var(--roxo2)}

/* ========== TOP FILMES ========== */
.sec-titulo{font-family:'Cinzel Decorative',serif;font-size:18px;color:var(--branco);margin-bottom:4px;padding-top:8px}
.sec-sub{font-size:10px;color:var(--cinza2);letter-spacing:3px;font-family:'Orbitron',monospace;margin-bottom:20px}
.top-card{
  background:var(--card);border:1px solid var(--borda);border-radius:16px;
  overflow:hidden;margin-bottom:12px;transition:.2s
}
.top-card:hover{border-color:var(--borda2);box-shadow:0 8px 24px rgba(0,0,0,.3)}
.top-capa{width:100%;height:160px;object-fit:cover;display:block}
.top-capa-ph{width:100%;height:160px;background:var(--card2);display:flex;align-items:center;justify-content:center;font-size:44px}
.top-corpo{padding:14px}
.top-nome{font-family:'Cinzel Decorative',serif;font-size:15px;color:var(--branco);margin-bottom:8px}
.top-stats{display:flex;gap:16px;margin-bottom:10px}
.top-stat{font-size:11px;color:var(--cinza);font-family:'Orbitron',monospace}
.top-stat b{color:var(--roxo)}
.top-music{
  display:flex;align-items:center;gap:8px;
  background:rgba(139,92,246,.08);border-radius:10px;padding:10px 12px
}
.top-play{
  width:34px;height:34px;border-radius:50%;border:none;
  background:linear-gradient(135deg,var(--roxo),var(--roxo2));
  color:#fff;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:.2s;flex-shrink:0
}
.top-play:hover{transform:scale(1.1)}
.top-music-nome{font-size:11px;font-weight:700;color:var(--branco);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}

/* ========== RANKING ========== */
.rank-item{
  display:flex;align-items:center;gap:12px;padding:14px;
  background:var(--card);border:1px solid var(--borda);border-radius:14px;margin-bottom:8px;transition:.2s
}
.rank-item:hover{border-color:var(--borda2);transform:translateX(2px)}
.rank-pos{font-family:'Orbitron',monospace;font-size:14px;font-weight:900;width:30px;text-align:center}
.rank-pos.p1{color:var(--ouro);text-shadow:0 0 10px rgba(251,191,36,.4)}
.rank-pos.p2{color:var(--prata)}
.rank-pos.p3{color:var(--bronze)}
.rank-av{width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid var(--borda);flex-shrink:0}
.rank-info{flex:1}
.rank-nick{font-size:15px;font-weight:800;color:var(--branco)}
.rank-pts{font-size:10px;color:var(--cinza2);font-family:'Orbitron',monospace;margin-top:2px}
.rank-emoji{font-size:18px}

/* ========== PERFIL ========== */
.perfil-topo{
  width:calc(100% + 32px);height:88px;margin:-68px -16px 0;
  background:linear-gradient(135deg,rgba(109,40,217,.4),rgba(7,8,15,0));padding-top:68px
}
.perfil-av{width:78px;height:78px;border-radius:50%;object-fit:cover;border:3px solid var(--roxo);box-shadow:0 0 20px rgba(139,92,246,.35);margin:-40px 0 12px}
.perfil-nick{font-family:'Cinzel Decorative',serif;font-size:17px;color:var(--branco);margin-bottom:16px}
.perfil-stats{display:flex;gap:24px;margin-bottom:20px}
.p-stat{display:flex;flex-direction:column;align-items:center;gap:2px}
.p-stat-n{font-family:'Orbitron',monospace;font-size:20px;font-weight:900;color:var(--roxo)}
.p-stat-l{font-size:9px;color:var(--cinza2);letter-sp
