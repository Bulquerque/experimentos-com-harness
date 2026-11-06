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
 * SpriteDirector: atores Lia/Dante v23 RGBA (8 estados); juiz Elias preservado.
 *
 * ÚNICA responsabilidade: trocar imagens no navegador a partir dos eventos
 * gerados pelo Harness. Nenhum prompt, modelo, ferramenta ou API de IA aqui.
 * Fontes de quadros: /assets/actors-v22/manifest.json e /assets/trio/manifest.json (juiz).
 *
 * Frames RGBA já transparentes, sem chroma-key em CSS.
 */
export class SpriteDirector {
  constructor(root = document) {
    this.root = root;
    this.manifest = null;
    this.actorAnimations = {};
    this.players = new Map();
    this.paused = false;
    this.preloaded = new Set();
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.turnSequenceActive = false;
    this.pendingThinkingSide = null;
    this.turnSequencePhase = null;
    this.turnSequenceContext = null;
    this.turnMeta = null;
    this.animationHistory = new Map();
  }

  // A memória é separada para cada personagem e papel, e só registra
  // movimentos realmente iniciados. A semântica limita as alternativas.
  selectAnimation(side, role, preferred, alternatives = []) {
    const person=side==='a'?'lia':'dante';
    const last=this.animationHistory.get(`${side}:${role}`);
    if(last!==preferred)return preferred;
    return alternatives.find(track=>track!==last&&this.track(person,track).length)||preferred;
  }
  recordAnimation(side,role,track){this.animationHistory.set(`${side}:${role}`,track);}
  resetVariety(){this.animationHistory.clear();}

  async load() {
    const res = await fetch('/assets/trio/manifest.json');
    if (!res.ok) throw new Error(`Manifesto visual indisponível: ${res.status}`);
    const data = await res.json();
    if (!data.animations || Object.keys(data.animations).length < 20) throw new Error('Manifesto visual incompleto.');
    this.manifest = data;
    // Modo offline recebe os mesmos dados já embutidos: nenhum fetch em file://.
    const actorManifest = window.CONTRAPONTO_ACTOR_MANIFEST || await (async () => {
      const response = await fetch('/assets/actors-v22/manifest.json');
      if (!response.ok) throw new Error(`Manifesto Lia/Dante v22 indisponível: ${response.status}`);
      return response.json();
    })();
    for (const person of ['lia','dante']) for (const state of ['idle','talking','thinking','confident','objection','surprised','frustrated','breakdown']) {
      const frames = actorManifest.animations?.[`${person}/${state}`];
      if (!Array.isArray(frames) || frames.length !== 8 || frames.some(item => !this.url(item.frame))) {
        throw new Error(`Animação v22 inválida: ${person}/${state}`);
      }
    }
    this.actorAnimations = actorManifest.animations;
    for (const person of ['lia', 'dante']) {
      for (const track of ['idle', 'talking', 'objection']) {
        const frame = this.track(person, track)[0];
        if (frame) { const img = new Image(); img.src = this.url(frame.frame); }
      }
    }
    this.judgeAction('idle');
    return data;
  }

  url(frame) {
    // Somente caminhos previamente definidos em manifestos locais.
    if (typeof frame !== 'string' || frame.includes('..')) return null;
    if (/^actors-v22\/(lia|dante)\/(idle|talking|thinking|confident|objection|surprised|frustrated|breakdown)\/0[1-8]\.png$/.test(frame))
      return '/assets/' + frame;
    if (/^personagens\/[a-z0-9_\/.-]+\.png$/i.test(frame))
      return '/assets/trio/' + frame;
    return null;
  }

  track(person, name) {
    return this.actorAnimations[`${person}/${name}`] || this.manifest?.animations?.[`${person}/${name}`] || [];
  }

  /** A mesma pose Idle é usada como retrato de espera e início das cenas. */
  defaultStill(side) {
    const person = side === 'a' ? 'lia' : 'dante';
    const first = this.track(person, 'idle')[0];
    if (first) return this.url(first.frame);
    const entry = this.manifest?.layout?.find(item => item.character_id === person);
    return entry?.primary_sprite ? this.url(entry.primary_sprite) : null;
  }

  /** Efeitos de Elias são imagens reais do pacote, não CSSs que encobrem o corpo.
   * O close-up dos olhos sai antes da batida; o clarão coincide com o martelo. */
  judgeAccent(action) {
    this.stop('judge-eyes'); this.stop('judge-fx');
    this.stop('judge-eye-hide'); this.stop('judge-fx-start');
    const eyes=this.root.getElementById('judge-eyes-sprite');
    const impact=this.root.getElementById('judge-impact-sprite');
    if(eyes) eyes.hidden=true;
    if(impact) impact.hidden=true;
    if(!this.manifest || !['order','judgment','verdict'].includes(action)) return;
    if(eyes) {
      eyes.hidden=false;
      this.play('judge-eyes','elias','faixas_olhos',eyes,{speed:2,minFrameMs:65,onStart:({duration})=>duration>0?this.audio?.animationCue?.('judge','faixas_olhos','reaction',duration):null});
      this.after('judge-eye-hide',510,()=>{eyes.hidden=true;this.stop('judge-eyes');});
    }
    if(impact && action==='judgment') {
      // O efeito é curto e acompanha os últimos quadros da martelada.
      this.after('judge-fx-start',650,()=>{
        impact.hidden=false;
        this.play('judge-fx','elias','efeitos',impact,{onStart:({duration})=>duration>0?this.audio?.animationCue?.('judge','efeitos','reaction',duration):null,onEnd:()=>{impact.hidden=true;}});
      });
    }
  }

  /** Elias é um personagem visual, mas NÃO um quarto agente de IA. */
  judgeAction(action = 'idle') {
    this.stop('judge-stage'); this.stop('judge-sidebar');
    this.judgeAccent(action);
    const sequences = {idle:['idle'], observe:['observacao'], thinking:['pensando'], opening:['anuncio','idle'],
      order:['ordem','idle'], judgment:['martelo','veredito','idle'], verdict:['veredito','idle']};
    const selected = sequences[action] || sequences.idle;
    for(const [key,id] of [['judge-stage','judge-stage-sprite'],['judge-sidebar','judge-sidebar-sprite']]) {
      const img = this.root.getElementById(id);
      if (!img) continue;
      const run = index => {
        const track = selected[index];
        if (!track) return;
        const loop = index === selected.length - 1 && ['idle','observacao','pensando'].includes(track);
        this.play(key,'elias',track,img,{loop,onStart:({duration})=>duration>0&&key==='judge-stage'&&track!=='idle'?this.audio?.animationCue?.('judge',track,'speaker',duration):null,onEnd:()=>run(index+1)});
      };
      run(0);
    }
  }


  /** Frames de uma ação são pré-carregados no instante do Face Card. */
  preload(person, track) {
    const key = `${person}/${track}`;
    if (this.preloaded.has(key)) return;
    this.preloaded.add(key);
    for (const frame of this.track(person, track)) {
      const url = this.url(frame.frame);
      if (url) { const image = new Image(); image.src = url; }
    }
  }

  /** Uma espera cancelável. Uma nova fala nunca dispara um gesto antigo. */
  schedule(token, delay, callback) {
    token.remaining=Math.max(0,delay);token.callback=callback;
    if(this.paused)return;
    token.deadline=performance.now()+token.remaining;
    token.timer=setTimeout(()=>{token.timer=null;callback();},token.remaining);
  }
  pause(paused) {
    this.paused=Boolean(paused);
    for(const token of this.players.values()){
      if(this.paused){if(token.timer!=null){clearTimeout(token.timer);token.timer=null;token.remaining=Math.max(0,token.deadline-performance.now());}}
      else if(token.timer==null&&token.callback)this.schedule(token,token.remaining,token.callback);
    }
  }
  after(key, delay, callback, cleanup=null) {
    this.stop(key);
    const token = {cancelled:false,timer:null,cleanup};
    this.players.set(key, token);
    this.schedule(token,Math.max(20,delay/(window.CONTRAPONTO_ANIMATION_SPEED||1)),() => {
      if (token.cancelled) return;
      this.players.delete(key);
      token.cleanup?.();token.cleanup=null;
      callback();
    });
  }
  stop(key) {
    const active = this.players.get(key);
    if (active) { active.cancelled = true; clearTimeout(active.timer); active.cleanup?.();active.cleanup=null;this.players.delete(key); }
  }
  stopAll() {
    for (const key of [...this.players.keys()]) this.stop(key);
    this.turnSequenceActive = false;
    this.pendingThinkingSide = null;
    this.turnSequencePhase = null;
    this.turnSequenceContext = null;
  }

  markActor(img, person, track) {
    if (['lia','dante'].includes(person) && Object.hasOwn(this.actorAnimations, `${person}/${track}`)) {
      img.dataset.motionSet = 'v22';
      img.parentElement?.classList.add('v22-portrait');
    } else {
      delete img.dataset.motionSet;
    }
  }

  /** Loop ou sequência única. Ao finalizar, chama onEnd se não foi cancelada. */
  play(key, person, track, img, { loop = false, onStart = () => {}, onEnd = () => {}, speed = 1, minFrameMs = 75 } = {}) {
    this.stop(key);
    const frames = this.track(person, track);
    if (!img || !frames.length) { onEnd(); return false; }
    const token = {cancelled:false,timer:null};
    this.players.set(key,token);
    const reduced = !!this.reducedMotion?.matches;
    if (reduced) {
      img.src = this.url(frames[frames.length-1].frame);
      this.markActor(img, person, track);
      // Em movimento reduzido, não repetimos nem criamos timers.
      this.players.delete(key);
      onStart({person,track,duration:0});
      onEnd();return true;
    }
    let index = 0;
    const show = () => {
      if (token.cancelled) return;
      const f = frames[index];
      img.src = this.url(f.frame);
      this.markActor(img, person, track);
      img.dataset.animation = `${person}/${track}`;
      img.dataset.frame = String(index+1);
      if(index===0)token.cleanup=onStart({person,track,duration:frames.reduce((sum,frame)=>sum+Math.max(minFrameMs,Math.min(1400,frame.duration_ms/(speed*(window.CONTRAPONTO_ANIMATION_SPEED||1)))),0)})||null;
      this.schedule(token,Math.max(minFrameMs, Math.min(1400, f.duration_ms / (speed*(window.CONTRAPONTO_ANIMATION_SPEED||1)))),() => {
        if (token.cancelled) return;
        index++;
        if (index >= frames.length) {
          token.cleanup?.();token.cleanup=null;
          if (!loop) { this.players.delete(key); onEnd(); return; }
          index = 0;
        }
        show();
      });
    };
    show();
    return true;
  }

  /**
   * Escolhe animações do palestrante e do ouvinte para cada intenção.
   * O mesmo contrato é usado no Debate Singular e nos futuros turnos NIM.
   */
  performancePhase(phase, side, turn) {
    this.turnSequencePhase = phase;
    this.turnSequenceContext = {side,name:turn.name||'',position:turn.position||''};
    const actor = this.root.getElementById(`duelist-${side}`);
    const color = actor ? getComputedStyle(actor).getPropertyValue('--tone').trim() : '';
    this.root.dispatchEvent?.(new CustomEvent('contraponto:performance-phase', {
      detail:{phase,side,name:turn.name||'',position:turn.position||'',color}
    }));
  }

  turn(turn) {
    if (!this.manifest) return;
    const side = String(turn.speaker).toLowerCase();
    if (!['a', 'b'].includes(side)) return;
    const incoming=turnIdentity(turn);
    const previous=this.turnMeta;
    const sameId=!!incoming.id && incoming.id===previous?.id;
    const sameActive=!!previous && this.turnSequenceActive && incoming.signature===previous.signature;
    const sameRecent=!!previous && !this.turnSequenceActive && incoming.signature===previous.signature
      && Date.now()-(previous.finishedAt||0)<8000 && relatedSpeech(previous.speech,incoming.speech);
    if(sameId||sameActive||sameRecent){
      if(incoming.speech.length>(previous?.speech.length||0))previous.speech=incoming.speech;
      return false;
    }
    this.turnMeta={...incoming,finishedAt:0};
    const other = side === 'a' ? 'b' : 'a';
    const person = side === 'a' ? 'lia' : 'dante';
    const opponent = other === 'a' ? 'lia' : 'dante';
    const img = this.root.getElementById(`pack-avatar-${side}`);
    const opponentImg = this.root.getElementById(`pack-avatar-${other}`);
    const allowed = s => this.root.getElementById(`custom-avatar-${s}`)?.hidden !== false;
    // Um turno é uma só sequência serial: pausa de antecipação, gesto do
    // locutor, reação do ouvinte e repouso. Nova fala cancela a sequência toda.
    for (const key of ['actor-a','actor-b','listener-react-a','listener-react-b','actor-hold-a','actor-hold-b']) this.stop(key);
    this.turnSequenceActive = true;
    this.turnSequencePhase = 'anticipation';
    this.turnSequenceContext = {side,name:turn.name||'',position:turn.position||''};
    this.pendingThinkingSide = null;
    for (const [s,p,image] of [[side,person,img],[other,opponent,opponentImg]]) {
      if (!allowed(s) || !image) continue;
      image.src = this.defaultStill(s) || image.src;
      this.markActor(image,p,'idle');
      delete image.dataset.animation;
      delete image.dataset.frame;
    }
    const finish = () => {
      for (const [s,p,image] of [[side,person,img],[other,opponent,opponentImg]]) {
        if (!allowed(s) || !image) continue;
        image.src = this.defaultStill(s) || image.src;
        this.markActor(image,p,'idle');
        delete image.dataset.animation;
        delete image.dataset.frame;
      }
      this.performancePhase('settle',side,turn);
      this.turnSequenceActive = false;
      if(this.turnMeta)this.turnMeta.finishedAt=Date.now();
      this.turnSequencePhase = null;
      this.turnSequenceContext = null;
      if (this.pendingThinkingSide) {
        const pending = this.pendingThinkingSide;
        this.pendingThinkingSide = null;
        this.thinking(pending);
      }
    };
    // A ação define primeiro o sentido da fala. Para argumentos genéricos,
    // usamos também gesto e emoção: antes, uma emoção "thinking" acabava
    // vencendo sempre e deixava quase todas as falas com a mesma pose.
    const actionTrack = ({
      objection:'objection',
      rebuttal:turn.emotion === 'frustrated' ? 'frustrated' : 'confident',
      question:'talking',
      concession:'confident'
    })[turn.action];
    const gestureTrack = ({
      point: turn.emotion === 'frustrated' ? 'frustrated' : 'confident',
      'open-hand': turn.emotion === 'surprised' ? 'surprised' : 'talking',
      'arms-crossed': turn.emotion === 'frustrated' ? 'frustrated' : 'confident',
      'slam-desk': 'objection'
    })[turn.gesture];
    const emotionTrack = ({
      confident:'confident', frustrated:'frustrated', surprised:'surprised',
      thinking:'thinking', excited:'confident'
    })[turn.emotion];
    // Argumento com gesto explícito usa esse gesto como direção cênica;
    // falas sem gesto continuam podendo usar uma emoção pensativa.
    const baseTrack = actionTrack || gestureTrack || emotionTrack || 'talking';
    const ordinary=!['objection','question','rebuttal','concession'].includes(turn.action)&&!['frustrated','surprised'].includes(turn.emotion)&&turn.gesture!=='slam-desk';
    const first=this.selectAnimation(side,'speaker',baseTrack,ordinary?(baseTrack==='talking'?['confident']:baseTrack==='confident'?['talking']:[]):[]);
    if (!allowed(side)) { finish(); return; }
    this.preload(person, first);
    const reaction = ({objection:'surprised',rebuttal:turn.emotion==='frustrated'?'frustrated':'thinking',question:'thinking',concession:'confident'})[turn.action]
      || ({frustrated:'frustrated',surprised:'surprised',confident:'confident',excited:'confident'})[turn.emotion];
    const returnToRest = () => {
      this.performancePhase('listener',side,turn);
      if (reaction && allowed(other)) {
        this.preload(opponent,reaction);
        this.play(`listener-react-${other}`,opponent,reaction,opponentImg,{
          speed:.78,minFrameMs:100,onStart:({duration})=>{if(duration<=0)return null;this.recordAnimation(other,'listener',reaction);return this.audio?.animationCue?.(other,reaction,'reaction',duration);},onEnd:finish
        });
      } else finish();
    };
    const playGesture = () => this.play(`actor-${side}`,person,first,img,{
      speed:.78,minFrameMs:100,onStart:({duration})=>{if(duration<=0)return null;this.recordAnimation(side,'speaker',first);return this.audio?.animationCue?.(side,first,'speaker',duration);},onEnd:returnToRest
    });
    const deliver = () => {
      this.performancePhase('delivery',side,turn);
      playGesture();
    };
    if (this.reducedMotion?.matches) deliver();
    else this.after(`actor-${side}`,520,deliver);
  }

  /**
   * Debate Singular mostra uma fala em blocos clicáveis. Cada avanço cancela
   * qualquer sequência anterior e anima somente o locutor atual, uma vez.
   */
  singularBlock(turn, blockIndex=0, visibleSpeech=turn?.speech, onAnimation=()=>{}) {
    const side=String(turn?.speaker||'').toLowerCase();
    if(!['a','b'].includes(side)||!this.manifest)return false;
    this.stopAll();
    for(const key of ['actor-a','actor-b','listener-react-a','listener-react-b','actor-hold-a','actor-hold-b'])this.stop(key);
    this.pendingThinkingSide=null;
    this.turnSequenceActive=true;
    const person=side==='a'?'lia':'dante';
    const image=this.root.getElementById(`pack-avatar-${side}`);
    const custom=this.root.getElementById(`custom-avatar-${side}`)?.hidden===false;
    const still=this.defaultStill(side);
    // Limpa quadros residuais do locutor e do ouvinte antes de começar o bloco.
    for(const s of ['a','b']){
      const p=s==='a'?'lia':'dante';
      const actorImage=this.root.getElementById(`pack-avatar-${s}`);
      const idle=this.defaultStill(s);
      if(actorImage&&idle){actorImage.src=idle;this.markActor(actorImage,p,'idle');}
      if(actorImage){delete actorImage.dataset.animation;delete actorImage.dataset.frame;}
    }
    const finish=()=>{
      for(const s of ['a','b'])this.root.getElementById(`duelist-${s}`)?.classList.remove('speaking','listening','reacting');
      for(const s of ['a','b']){
        const p=s==='a'?'lia':'dante';
        const actorImage=this.root.getElementById(`pack-avatar-${s}`);
        const idle=this.defaultStill(s);
        if(actorImage&&idle){actorImage.src=idle;this.markActor(actorImage,p,'idle');}
        if(actorImage){delete actorImage.dataset.animation;delete actorImage.dataset.frame;}
      }
      this.turnSequenceActive=false;
      this.turnSequencePhase=null;
      this.turnSequenceContext=null;
      if(this.pendingThinkingSide){
        const pending=this.pendingThinkingSide;
        this.pendingThinkingSide=null;
        this.thinking(pending);
      }
    };
    // Refine turn metadata against this visible block. An objection action
    // must not leak into unrelated blocks of the same turn.
    const blockText=String(visibleSpeech||turn.blockText||turn.speech||'');
    const objectionText=/(?:\bobjeç(?:ão|o|ões)\b|\bobjection\b|\bpela ordem\b|\bponto de ordem\b|\bprotesto\b)/iu.test(blockText);
    const explicitObjection=/(?:^\s*(?:objeç(?:ão|o)|objection)(?=\s|[!,:.]|$)|\bpela ordem\b|\bponto de ordem\b|\bprotesto\b)/iu.test(blockText);
    const objectionHere=(turn.action==='objection'&&objectionText)||explicitObjection;
    const blockTurn={...turn,action:turn.action==='objection'&&!objectionHere?'argument':turn.action,
      gesture:objectionHere?(turn.gesture==='slam-desk'?'slam-desk':'point'):turn.gesture};
    const action=blockTurn.action;
    const emotion=turn.emotion;
    const fixed=({
      objection:'objection',
      rebuttal:emotion==='frustrated'?'frustrated':'confident',
      // Quem pergunta continua entregando a fala; a pose de pensamento fica
      // reservada ao ouvinte, para não parecer uma pausa do locutor.
      question:'talking',
      concession:'confident'
    })[action];
    const variants=emotion==='frustrated'?['frustrated','confident']:
      emotion==='surprised'?['confident','talking']:
      emotion==='thinking'?['talking','confident']:
      ['talking','confident'];
    // Use o sentido do trecho atual para variar a entrega. Se o texto não
    // trouxer um sinal claro, action/emotion/gesture do modelo seguem como
    // fallback, com alternância determinística entre os blocos restantes.
    const textIntent=objectionHere?'objection':
      /\b(?:desisto|não tenho resposta|fui derrotado|perdi|não consigo sustentar|retiro minha posição)\b/iu.test(blockText)?'breakdown':
      /\b(?:surpreendente|inacreditável|não esperava|que novidade|impressionante)\b/iu.test(blockText)?'surprised':
      (/[?¿]/.test(blockText)||/^\s*(?:quem|como|quando|onde|por que|qual|quais|será que)\b/iu.test(blockText))?'question':
      /\b(?:concordo|reconheço|admito|concedo|faz sentido|tem razão|é justo)\b/iu.test(blockText)?'concession':
      /\b(?:portanto|logo|em síntese|concluindo|por isso|isso demonstra|fica claro)\b/iu.test(blockText)?'conclusion':
      /\b(?:discordo|não procede|incorreto|refuto|porém|contudo|entretanto|mas)\b/iu.test(blockText)?'rebuttal':
      /\b(?:afirmo|defendo|sustento|devemos|é necessário|é fundamental)\b/iu.test(blockText)?'assertion':null;
    const contentTrack=({objection:'objection',breakdown:'breakdown',surprised:'surprised',question:'talking',concession:'confident',conclusion:'confident',
      rebuttal:emotion==='frustrated'?'frustrated':'confident',assertion:emotion==='confident'?'confident':'talking'})[textIntent];
    const gestureOffset=turn.gesture==='arms-crossed'||turn.gesture==='point'?1:0;
    const preferredTrack=contentTrack||fixed||variants[(Math.max(0,Number(blockIndex)||0)+gestureOffset)%variants.length];
    const freeSpeaker=!['frustrated','surprised'].includes(emotion)&&
      (!textIntent&&!fixed||['assertion','conclusion','concession'].includes(textIntent)||action==='concession');
    const track=this.selectAnimation(side,'speaker',preferredTrack,freeSpeaker?(preferredTrack==='talking'?['confident']:preferredTrack==='confident'?['talking']:[]):[]);
    const other=side==='a'?'b':'a';
    const listenerPerson=other==='a'?'lia':'dante';
    const listenerImage=this.root.getElementById(`pack-avatar-${other}`);
    const customListener=this.root.getElementById(`custom-avatar-${other}`)?.hidden===false;
    const preferredListener=objectionHere?'surprised':textIntent==='question'?'thinking':
      ['concession','conclusion'].includes(textIntent)?'confident':textIntent==='rebuttal'?'thinking':
      action==='question'?'thinking':action==='concession'?'confident':action==='rebuttal'?'frustrated':'thinking';
    const freeListener=!textIntent&&!['question','concession','rebuttal','objection'].includes(action);
    const listenerTrack=this.selectAnimation(other,'listener',preferredListener,freeListener?['idle']:[]);
    const reactToListener=()=>{
      this.turnSequencePhase='listener';
      const listener=this.root.getElementById(`duelist-${other}`);
      listener?.classList.remove('speaking');listener?.classList.add('listening','reacting');
      if(customListener||!listenerImage){
        listener?.style.setProperty('--singular-reaction-duration',`${620/(window.CONTRAPONTO_ANIMATION_SPEED||1)}ms`);
        this.recordAnimation(other,'listener',listenerTrack);
        const cleanup=onAnimation(other,listenerTrack,'reaction',620/(window.CONTRAPONTO_ANIMATION_SPEED||1));
        this.after(`listener-react-${other}`,620,()=>{listener?.classList.remove('reacting','listening');finish();},cleanup);
        return;
      }
      this.play(`listener-react-${other}`,listenerPerson,listenerTrack,listenerImage,{
        speed:.9,minFrameMs:105,
        onStart:({duration})=>{if(duration<=0)return null;this.recordAnimation(other,'listener',listenerTrack);return onAnimation(other,listenerTrack,'reaction',duration);},
        onEnd:()=>{
          const idle=this.defaultStill(other);
          if(idle){listenerImage.src=idle;this.markActor(listenerImage,listenerPerson,'idle');}
          delete listenerImage.dataset.animation;delete listenerImage.dataset.frame;
          listener?.classList.remove('reacting','listening');finish();
        }
      });
    };
    if(!image){reactToListener();return false;}
    if(custom){
      const actor=this.root.getElementById(`duelist-${side}`);
      actor?.style.setProperty('--singular-delivery-duration',`${700/(window.CONTRAPONTO_ANIMATION_SPEED||1)}ms`);
      actor?.classList.add('speaking');actor?.classList.remove('listening');
      this.recordAnimation(side,'speaker',track);
      const cleanup=onAnimation(side,track,'speaker',700/(window.CONTRAPONTO_ANIMATION_SPEED||1));
      this.after(`actor-${side}`,700,()=>{actor?.classList.remove('speaking');reactToListener();},cleanup);
      return true;
    }
    this.turnSequencePhase='anticipation';
    this.turnSequenceContext={side,name:turn.name||'',position:turn.position||''};
    if(still){image.src=still;this.markActor(image,person,'idle');}
    delete image.dataset.animation;
    delete image.dataset.frame;
    this.preload(person,track);
    const deliver=()=>{
      this.turnSequencePhase='delivery';
      const actor=this.root.getElementById(`duelist-${side}`);
      const listener=this.root.getElementById(`duelist-${other}`);
      actor?.classList.add('speaking');actor?.classList.remove('listening');
      listener?.classList.remove('speaking');listener?.classList.add('listening');
      this.play(`actor-${side}`,person,track,image,{
        speed:.82,minFrameMs:100,
        onStart:({duration})=>{if(duration<=0)return null;this.recordAnimation(side,'speaker',track);return onAnimation(side,track,'speaker',duration);},
        onEnd:()=>{
          if(still){image.src=still;this.markActor(image,person,'idle');}
          delete image.dataset.animation;
          delete image.dataset.frame;
          actor?.classList.remove('speaking');
          reactToListener();
        }
      });
    };
    if(this.reducedMotion?.matches)deliver();
    else this.after(`actor-${side}`,320,deliver);
    return true;
  }

  thinking(speaker) {
    // O LLM pode começar a preparar a próxima fala durante a reação atual.
    // Enfileira o estado para não cortar a sequência serial no meio.
    if (this.turnSequenceActive) {
      this.pendingThinkingSide = String(speaker).toLowerCase();
      this.root.dispatchEvent?.(new CustomEvent('contraponto:performance-hold', {
        detail:{...this.turnSequenceContext,phase:this.turnSequencePhase}
      }));
      return;
    }
    this.stopAll();
    const side = String(speaker).toLowerCase();
    if (!['a','b'].includes(side)) return;
    const other = side === 'a' ? 'b' : 'a';
    for (const s of [side,other]) {
      if (this.root.getElementById(`custom-avatar-${s}`)?.hidden === false) continue;
      const person=s==='a'?'lia':'dante';
      const img=this.root.getElementById(`pack-avatar-${s}`);
      this.play(`actor-${s}`,person,s===side?'thinking':'idle',img,{loop:true});
    }
  }

  /** Estado dramático de derrota: um único gesto, sem loop; o último quadro
   * continua visível até que a próxima cena ou o reinício o substitua.
   * Não afeta o juiz, não altera notas e respeita avatares personalizados.
   */
  breakdown(side) {
    if (!this.manifest || !['a','b'].includes(side)) return false;
    if (this.root.getElementById(`custom-avatar-${side}`)?.hidden === false) return false;
    const person = side === 'a' ? 'lia' : 'dante';
    const img = this.root.getElementById(`pack-avatar-${side}`);
    if (!img || !this.track(person,'breakdown').length) return false;
    for (const key of [`actor-${side}`,`actor-hold-${side}`,`listener-react-${side}`]) this.stop(key);
    this.preload(person,'breakdown');
    return this.play(`actor-${side}`,person,'breakdown',img,{loop:false});
  }

  /** Sequência de olhos no Face Card para objeção; demais ações usam imagem estática. */
  facecard(side, action, img) {
    this.stop('facecard');
    if (!this.manifest) return false;
    const person=side==='a'?'lia':'dante';
    const tracks={objection:'objection',rebuttal:'confident',question:'thinking',concession:'talking'};
    const track=tracks[action];
    if(!track)return false;
    img.parentElement?.classList.toggle('facecard-detail',action!=='objection');
    img.parentElement?.classList.add('v22-facecard');
    // Comprimimos o tempo do cut-in, NÃO eliminamos quadros.
    // O corpo será mostrado em velocidade normal após a faixa desaparecer.
    const fullDuration = this.track(person,track).reduce((sum,frame)=>sum+frame.duration_ms,0);
    return this.play('facecard',person,track,img,{
      speed:Math.max(1,fullDuration/460),minFrameMs:40
    });
  }
}
