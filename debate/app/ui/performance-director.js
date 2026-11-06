function turnIdentity(turn) {
  const speaker=String(turn?.speaker||'').toLowerCase();
  const id=turn?.turnId ?? turn?.utteranceId ?? turn?.messageId ?? turn?.id;
  const signature=[speaker,turn?.round??'',turn?.exchange??'',turn?.name??'',turn?.action??''].join('|');
  const speech=String(turn?.speech||'').trim().toLocaleLowerCase().replace(/\s+/g,' ');
  return {id:id==null?'':String(id),signature,speech};
}

function relatedSpeech(a,b) {
  if(!a||!b)return false;
  if(a===b||a.startsWith(b)||b.startsWith(a))return true;
  const left=a.split(' '),right=b.split(' ');
  for(let size=Math.min(5,left.length,right.length);size>=3;size--){
    if(left.slice(-size).join(' ')===right.slice(0,size).join(' '))return true;
  }
  return false;
}

/**
 * PerformanceDirector — atuação visual, sem dependência de IA.
 *
 * Transforma uma fala já recebida em pequenos momentos de cena. Ele nunca
 * altera o texto, cria argumentos ou chama NVIDIA: só decide QUANDO acender
 * um foco de luz, destacar o ouvinte e permitir uma pausa de performance.
 * Uma nova fala cancela todos os timers anteriores (evita reações atrasadas).
 */
export function performanceBeats(turn) {
  const action = ['objection','rebuttal','question','concession'].includes(turn?.action)
    ? turn.action : 'argument';
  const emotion = ['confident','frustrated','surprised','thinking','excited','neutral'].includes(turn?.emotion)
    ? turn.emotion : 'neutral';
  // Estimativas apenas para consumidores legados. A atuação ao vivo é
  // sincronizada pelos eventos reais do SpriteDirector, pois a duração do
  // gesto depende da faixa selecionada e da preferência de velocidade.
  const opening = 0;
  const emphasis = 520;
  const response = action === 'question' ? 2700 : action === 'objection' ? 2050 : 2550;
  return {
    action, emotion,
    beats: [
      { at: opening, phase:'delivery' },
      { at: emphasis, phase:'emphasis' },
      { at: response, phase:'listener' },
      { at: 3360, phase:'settle' }
    ]
  };
}

export class PerformanceDirector {
  constructor(root=document) {
    this.root=root;
    this.stage=root.getElementById('arena');
    this.timers=[];
    this.generation=0;
    this.reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.sequenceRunning=false;
    this.sequenceState=null;
    this.suspended=null;
    this.turnMeta=null;
    this.root.addEventListener?.('contraponto:performance-phase', event => {
      const detail=event.detail||{};
      if(!this.stage || detail.side!==this.stage.dataset.performanceSide)return;
      this.sequenceState={...this.sequenceState,...detail};
      this.scene(detail.phase,detail.side);
      const actor=this.root.getElementById(`duelist-${detail.side}`);
      if(actor){
        if(detail.name)actor.dataset.performanceName=detail.name;
        if(detail.position)actor.dataset.performancePosition=detail.position;
        if(detail.color)actor.dataset.performanceColor=detail.color;
      }
      this.stage.dataset.performanceSpeaker=detail.name||this.stage.dataset.performanceSpeaker||'';
      this.stage.dataset.performancePosition=detail.position||this.stage.dataset.performancePosition||'';
      this.stage.dataset.performanceColor=detail.color||this.stage.dataset.performanceColor||'';
      if(detail.phase==='settle'){
        this.sequenceRunning=false;
        if(this.turnMeta)this.turnMeta.finishedAt=Date.now();
        this.suspended=null;
      }
    });
    this.root.addEventListener?.('contraponto:performance-hold', event => {
      const detail=event.detail||{};
      if(!this.stage || !this.suspended || detail.side!==this.suspended.side)return;
      const saved=this.suspended;
      this.stage.dataset.performance='live';
      this.stage.dataset.performanceSide=saved.side;
      this.stage.dataset.performanceSpeaker=saved.name;
      this.stage.dataset.performancePosition=saved.position;
      this.stage.dataset.performanceColor=saved.color;
      this.stage.dataset.performanceAction=saved.action;
      this.stage.dataset.performanceEmotion=saved.emotion;
      this.scene(detail.phase||saved.phase,saved.side);
      const actor=this.root.getElementById(`duelist-${saved.side}`);
      if(actor){
        actor.dataset.performanceName=saved.name;
        actor.dataset.performancePosition=saved.position;
        actor.dataset.performanceColor=saved.color;
      }
      this.sequenceRunning=true;
    });
  }
  cancel({preserveSequence=true}={}) {
    if(preserveSequence && this.sequenceRunning && this.stage?.dataset.performance==='live'){
      this.suspended={
        side:this.stage.dataset.performanceSide,
        name:this.stage.dataset.performanceSpeaker||'',
        position:this.stage.dataset.performancePosition||'',
        color:this.stage.dataset.performanceColor||'',
        action:this.stage.dataset.performanceAction||'',
        emotion:this.stage.dataset.performanceEmotion||'',
        phase:this.stage.dataset.performancePhase||'anticipation'
      };
    } else if(!preserveSequence) {
      this.sequenceRunning=false;
      this.suspended=null;
    }
    this.generation++;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.length=0;
    for (const side of ['a','b']) {
      const el=this.root.getElementById(`duelist-${side}`);
      if (el) delete el.dataset.performanceCue;
      if (el) {
        delete el.dataset.performanceName;
        delete el.dataset.performancePosition;
        delete el.dataset.performanceColor;
      }
    }
    if (this.stage) {
      delete this.stage.dataset.performance;
      delete this.stage.dataset.performancePhase;
      delete this.stage.dataset.performanceSide;
      delete this.stage.dataset.performanceSpeaker;
      delete this.stage.dataset.performancePosition;
      delete this.stage.dataset.performanceColor;
    }
  }
  scene(phase, side) {
    if (this.reduced?.matches || !this.stage) return;
    this.stage.dataset.performancePhase=phase;
    for (const s of ['a','b']) {
      const el=this.root.getElementById(`duelist-${s}`);
      if (el) el.dataset.performanceCue=s===side ? phase : (phase==='listener'?'listener':'observe');
    }
  }
  turn(turn) {
    const side=String(turn?.speaker).toLowerCase();
    if (!['a','b'].includes(side) || !this.stage) return false;
    const incoming=turnIdentity(turn);
    const previous=this.turnMeta;
    const sameId=!!incoming.id && incoming.id===previous?.id;
    const sameActive=!!previous && this.sequenceRunning && incoming.signature===previous.signature;
    const sameRecent=!!previous && !this.sequenceRunning && incoming.signature===previous.signature
      && Date.now()-(previous.finishedAt||0)<8000 && relatedSpeech(previous.speech,incoming.speech);
    if(sameId||sameActive||sameRecent){
      if(incoming.speech.length>(previous?.speech.length||0))previous.speech=incoming.speech;
      return false;
    }
    this.turnMeta={...incoming,finishedAt:0};
    this.cancel();
    const {action,emotion}=performanceBeats(turn);
    this.stage.dataset.performance='live';
    this.stage.dataset.performanceSide=side;
    this.stage.dataset.performanceAction=action;
    this.stage.dataset.performanceEmotion=emotion;
    const actor=this.root.getElementById(`duelist-${side}`);
    const color=actor ? getComputedStyle(actor).getPropertyValue('--tone').trim() : '';
    this.stage.dataset.performanceSpeaker=turn.name||'';
    this.stage.dataset.performancePosition=turn.position||'';
    this.stage.dataset.performanceColor=color;
    this.sequenceState={phase:'anticipation',side,name:turn.name||'',position:turn.position||'',color};
    this.sequenceRunning=true;
    this.suspended=null;
    if(actor){
      actor.dataset.performanceName=turn.name||'';
      actor.dataset.performancePosition=turn.position||'';
      actor.dataset.performanceColor=color;
    }
    this.scene('anticipation',side);
  }
  judging() {
    this.cancel();
    this.sequenceRunning=false;
    this.suspended=null;
    if(this.stage) this.stage.dataset.performance='judge';
  }
}
