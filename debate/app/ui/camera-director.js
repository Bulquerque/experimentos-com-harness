/* CONTRAPONTO — direção visual desacoplada do Harness/NIM.
   Apenas interpreta ações estruturadas; não chama LLM nem expõe tool ao agente. */
(function () {
 const SHOTS=new Set(['wide','a','b','a-close','b-close','duel','judge']);
 const ACTIONS=new Set(['argument','rebuttal','question','objection','concession']);
 const NAMES={argument:'ARGUMENTO',rebuttal:'CONTRA-ARGUMENTO',question:'INTERROGAÇÃO',objection:'OBJEÇÃO!',concession:'PONTO CONCEDIDO'};
 const SUBTITLES={argument:'UMA IDEIA EM DEFESA',rebuttal:'UM ARGUMENTO SOB PRESSÃO',question:'RESPOSTA EXIGIDA',objection:'A DISCUSSÃO ESQUENTA',concession:'UM PASSO EM DIREÇÃO AO CONSENSO'};
 class CinemaDirector {
  constructor(stage,audio) {
   this.stage=stage; this.audio=audio; this.caption=document.getElementById('camera-caption');
   this.announcement=document.getElementById('cinema-announcement');
   this.enabled=true;this.mode='cinematic';this.lastShot='wide';this.timers=new Set();this.sequence=0;this.take=0;this.tension=0;this.ribbon=document.getElementById('scene-action-ribbon');
   this.motionQuery=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  }
  later(fn,delay) {const sequence=this.sequence;const id=setTimeout(()=>{this.timers.delete(id);if(sequence===this.sequence)fn();},delay/(window.CONTRAPONTO_ANIMATION_SPEED||1));this.timers.add(id);}
  cancel() {
   this.sequence++;
   for(const id of this.timers)clearTimeout(id);this.timers.clear();
   this.stage.classList.remove('beat-pulse','impact','slam-impact','scene-enter','scene-judged','scene-question','scene-concession','scene-transition','scene-suspense','scene-celebrate');
   this.announcement?.classList.remove('visible','warning');this.ribbon?.classList.remove('show');
   delete this.stage.dataset.shotPhase;
  }
  focus(shot='wide',caption='') {
   if(!SHOTS.has(shot))shot='wide';
   this.lastShot=shot;this.take++;const take=document.getElementById('scene-take');if(take)take.textContent=`TAKE ${String(this.take).padStart(3,'0')}`;
   this.stage.dataset.camera=(this.enabled&&!this.motionQuery?.matches)?shot:'wide';
   if(this.caption)this.caption.textContent=caption||({wide:'PLANO GERAL',a:'FOCO / LADO A',b:'FOCO / LADO B','a-close':'PRIMEIRÍSSIMO PLANO / A','b-close':'PRIMEIRÍSSIMO PLANO / B',duel:'DUAS PERSPECTIVAS',judge:'A PALAVRA DO JUIZ'})[shot];
  }
  setEnabled(on) {
   this.enabled=Boolean(on);this.cancel();
   this.stage.classList.toggle('cinema-off',!this.enabled);
   this.stage.dataset.camera=this.enabled&&!this.motionQuery?.matches?this.lastShot:'wide';
  }
  setMode(mode) {this.mode=mode==='soft'?'soft':'cinematic';this.stage.dataset.director=this.mode;}
  side(speaker){return String(speaker).toUpperCase()==='A'?'a':'b';}
  announce(title,kicker='',foot='',warning=false,ms=900) {
   if(!this.announcement||!this.enabled||this.motionQuery?.matches)return;
   document.getElementById('cinema-announcement-title').textContent=title;
   document.getElementById('cinema-announcement-kicker').textContent=kicker;
   document.getElementById('cinema-announcement-foot').textContent=foot;
   this.announcement.classList.toggle('warning',warning);
   this.announcement.classList.remove('visible');void this.announcement.offsetWidth;
   this.announcement.classList.add('visible');
   this.later(()=>this.announcement?.classList.remove('visible'),ms);
  }
  setTension(value=0){this.tension=Math.max(0,Math.min(3,Math.round(value)));this.stage.dataset.tension=String(this.tension);}
  beat(side='a'){
   if(!this.enabled||this.motionQuery?.matches)return;
   this.stage.style.setProperty('--beat-x',side==='a'?'30%':side==='b'?'70%':'50%');
   this.stage.classList.remove('beat-pulse');void this.stage.offsetWidth;
   this.stage.classList.add('beat-pulse');this.later(()=>this.stage.classList.remove('beat-pulse'),700);
  }
  actionRibbon(action){
   if(!this.ribbon||!this.enabled||this.motionQuery?.matches)return;
   const copy={objection:['OBJEÇÃO!','UM ARGUMENTO SOB ATAQUE'],rebuttal:['REFUTAÇÃO!','A DISCUSSÃO SE INTENSIFICA'],question:['INTERROGAÇÃO','UMA RESPOSTA É EXIGIDA'],concession:['CONCESSÃO','UM PONTO RECONHECIDO']}[action];
   if(!copy)return;
   document.getElementById('scene-action-title').textContent=copy[0];
   document.getElementById('scene-action-subtitle').textContent=copy[1];
   this.ribbon.dataset.kind=action;this.ribbon.classList.remove('show');void this.ribbon.offsetWidth;
   this.ribbon.classList.add('show');this.later(()=>this.ribbon?.classList.remove('show'),1040);
  }
  clearPerformers() {
   for(const side of ['a','b']) {
    const el=document.getElementById(`duelist-${side}`);
    if(el){el.classList.remove('perform','react-now','anticipation');el.dataset.reacting='observing';}
   }
  }
  round(n) {
   this.cancel();this.clearPerformers();this.setTension(0);this.focus('wide',`ROUND ${n} / ATO ${String(n).padStart(2,'0')}`);
   this.audio?.cue('round');
   if(!this.enabled)return;
   this.stage.classList.add('scene-enter');
   this.announce(`ROUND ${String(n).padStart(2,'0')}`,'A ARENA ESTÁ ABERTA','QUE COMECE O CONFRONTO',false,1000);
   this.later(()=>this.stage.classList.remove('scene-enter'),1200);
  }
  thinking(speaker) {
   this.cancel();this.clearPerformers();
   const side=this.side(speaker),other=side==='a'?'b':'a';
   this.focus(side,`LADO ${speaker} / FORMULANDO RESPOSTA`);
   document.getElementById(`duelist-${side}`)?.classList.add('anticipation');
   const opponent=document.getElementById(`duelist-${other}`);
   if(opponent)opponent.dataset.reacting='observing';
   this.audio?.cue('thinking');
  }
  turn(turn) {
   this.cancel();this.clearPerformers();
   const action=ACTIONS.has(turn.action)?turn.action:'argument';
   const side=this.side(turn.speaker),other=side==='a'?'b':'a';
   const actor=document.getElementById(`duelist-${side}`),opponent=document.getElementById(`duelist-${other}`);
   if(actor){actor.classList.add('perform');actor.dataset.reacting='focused';}
   if(opponent){opponent.dataset.reacting=({objection:'shocked',rebuttal:'tense',question:'thinking',concession:'respect',argument:'observing'})[action];opponent.classList.add('react-now');}
   this.setTension(({argument:1,question:2,rebuttal:3,objection:3,concession:1})[action]);
   const dramatic=action!=='argument';
   if(!dramatic) {
    this.focus(side,`${turn.speaker} / ${NAMES[action]}`);
    this.audio?.cue(action,{side});
    if(this.enabled&&!this.motionQuery?.matches) {
     this.later(()=>this.focus('duel','DUAS PERSPECTIVAS'),1600);
     this.later(()=>this.focus(side,`LADO ${turn.speaker} / EXPOSIÇÃO`),2700);
    }
    return;
   }
   // Uma coreografia de quatro beats: antecipação → gesto integral → reação → repouso.
   // O retrato dos olhos aparece antes do corpo, nunca cobrindo sua ação completa.
   this.stage.dataset.shotPhase='anticipation';
   this.focus('duel',`${turn.speaker} / PREPARANDO ${NAMES[action]}`);
   if(!this.enabled||this.motionQuery?.matches) {
    this.audio?.cue(action,{side});return;
   }
   this.beat(side);
   this.later(()=>{
    this.stage.dataset.shotPhase='performance';
    this.focus(side,`${turn.speaker} / ${NAMES[action]} · GESTO`);
    this.audio?.cue(action,{side});
    this.stage.classList.add(action==='objection'?'impact':'slam-impact');
    this.later(()=>this.stage.classList.remove('impact','slam-impact'),570);
   },590);
   // Duração dos estados v22 usados pelo SpriteDirector: objeção 1080,
   // refutação/confiança 1560, pergunta/pensamento 1640 e concessão/confiança
   // 1560 ms. A câmera só corta depois do último quadro desses gestos.
   const poseMs={objection:1080,rebuttal:1560,question:1640,concession:1560}[action];
   this.later(()=>{
    this.stage.dataset.shotPhase='reaction';
    this.focus(other,'REAÇÃO DO ADVERSÁRIO');
   },590+poseMs+160);
   this.later(()=>{
    this.stage.dataset.shotPhase='settle';
    this.focus('duel','DUAS TESES / UM CONFRONTO');
   },590+poseMs+880);
  }
  judging(round) {
   this.cancel();this.clearPerformers();this.setTension(2);
   this.focus('judge',`JUIZ / AVALIANDO ROUND ${round}`);this.stage.classList.add('scene-suspense');
   this.audio?.cue('judging');
   this.announce('DELIBERAÇÃO','SILÊNCIO NO TRIBUNAL','OS ARGUMENTOS ESTÃO SOB ANÁLISE',false,1020);
  }
  judgment(result) {
   this.cancel();this.setTension(2);this.focus('judge',`ROUND ${result.round} / VEREDITO`);
   // O martelo está no clímax do frame 3 (≈650 ms). Som, flash e movimento
   // acontecem juntos; só então exibimos a pontuação, sem esconder o gesto.
   const hitMs=this.motionQuery?.matches?0:650;
   this.later(()=>{
    this.stage.classList.add('scene-judged');
    this.audio?.cue('judgment');
   },hitMs);
   const label=result.winner==='empate'?'EMPATE!':`PONTO PARA ${result.winner}`;
   this.later(()=>this.announce(label,'O JUIZ DECIDIU',`${result.scoreA}  —  ${result.scoreB}`,false,1000),hitMs+520);
   this.later(()=>{this.stage.classList.remove('scene-judged');if(result.winner!=='empate')this.focus(this.side(result.winner),'VENCEDOR / ROUND');else this.focus('wide','ROUND EMPATADO');},3400);
  }
  finished(winner) {
   this.cancel();this.clearPerformers();this.setTension(1);this.focus('wide','DEBATE ENCERRADO / CONCLUSÃO');
   this.stage.classList.add('scene-celebrate');this.audio?.cue('finished');
   this.announce(winner==='empate'?'EMPATE!':'FIM DE DEBATE','O ÚLTIMO ROUND','RESULTADO NO PAINEL DO JUIZ',false,1400);
   this.later(()=>this.stage.classList.remove('scene-celebrate'),2100);
  }
  reset() {
   this.cancel();this.clearPerformers();this.setTension(0);this.focus('wide','PLANO GERAL');
  }
 }
 window.ContrapontoCinema=CinemaDirector;
})();
