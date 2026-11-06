/* CONTRAPONTO v17 — controlador do roteiro offline (sem IA, sem rede).
 * Um clique revela a frase; o clique seguinte muda a cena. Todas as animações
 * continuam sendo desenhadas pelo app, que recebe os mesmos eventos do SSE.
 */
(() => {
  'use strict';
  let fixture = window.CONTRAPONTO_SCENARIO;
  if (!fixture) throw new Error('O roteiro offline não foi carregado.');
  const $ = id => document.getElementById(id);
  const settings = {manual:true, speed:0.7, textDelay:35, paused:false, session:null, count:0};
  let lastInput = 0;

  // Cenas, não pacotes temporizados: thinking+turn são um único clique.
  function buildScenes(config) {
    const scenes=[];
    const intro={type:'started',data:{config}};
    for(let round=1;round<=config.rounds;round++) {
      const opening={type:'round_start',data:{round,total:config.rounds,subtopic:config.roundTopics[round-1]}};
      scenes.push(round===1?[intro,opening]:[opening]);
      // O evento de revelação é uma CENA própria, avançada por clique.
      // As falas desta sessão aparecem somente depois que a nova prova entrou.
      if (fixture.verdict) {
        const plan=fixture.preset.caseEvidencePlan||[];
        for (const item of plan.filter(p=>p.releaseRound===round)) {
          const doc=fixture.documents.find(d=>d.id===item.documentId);
          scenes.push([{type:'evidence_released',data:{documentId:item.documentId,round,reason:'agendada',documentName:doc?.name||item.documentId}}]);
        }
      }
      for(const turn of fixture.turns.filter(t=>t.round===round)) {
        scenes.push([{type:'thinking',data:{speaker:turn.speaker,round}},{type:'turn',data:turn}]);
      }
      if (!fixture.verdict) {
        scenes.push([{type:'judging',data:{round}}]);
        scenes.push([{type:'judgment',data:fixture.judgments[round-1]}]);
      }
    }
    if (fixture.verdict) {
      scenes.push([{type:'judging',data:{round:config.rounds,final:true}}]);
      scenes.push([{type:'case_verdict',data:fixture.verdict}]);
      scenes.push([{type:'finished',data:{format:'court',verdict:fixture.verdict,decision:fixture.verdict.decision}}]);
      return scenes;
    }
    const totalA=fixture.judgments.reduce((n,j)=>n+j.scoreA,0);
    const totalB=fixture.judgments.reduce((n,j)=>n+j.scoreB,0);
    scenes.push([{type:'finished',data:{totalA,totalB,winner:totalA===totalB?'empate':totalA>totalB?'A':'B'}}]);
    return scenes;
  }

  // Efeito de digitação — não altera o texto do roteiro nem modifica a IA.
  // Quem prefere acessibilidade pode escolher 'instantâneo'.
  const typewriter = {
    timer:null, full:'', chars:[], index:0, active:false,
    stop(){clearTimeout(this.timer);this.timer=null;this.active=false;},
    reveal(){
      if(!this.active)return false;
      this.stop();$('speech-text').textContent=this.full;refreshHint();return true;
    },
    start(text){
      this.stop();this.full=String(text||'');this.chars=Array.from(this.full);this.index=0;
      const el=$('speech-text');
      if(!el)return;
      if(!this.full || settings.textDelay<=0 || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches){
        el.textContent=this.full;refreshHint();return;
      }
      el.textContent='';this.active=true;
      const step=()=>{
        if(!this.active)return;
        // Avanço em blocos curtos para manter a digitação suave até em frases longas.
        const slice=this.chars.slice(this.index,this.index+2).join('');
        el.textContent+=slice;this.index+=2;
        if(this.index>=this.chars.length){this.stop();refreshHint();return;}
        this.timer=setTimeout(step,settings.textDelay*2);
      };
      step();refreshHint();
    }
  };

  function refreshHint() {
    const session=settings.session;
    const done=session?.closed || (session && session.position>=session.scenes.length);
    const hint=$('dialogue-hint'), next=$('offline-next');
    if(hint)hint.textContent=!session?'▶ INICIE O DEBATE':typewriter.active?'CLIQUE PARA REVELAR O TEXTO':done?'FIM DO DEBATE · REINICIE':'CLIQUE PARA CONTINUAR  ◆';
    if(next){next.disabled=Boolean(session?.closed);next.textContent=!session?'▶ COMEÇAR DEMONSTRAÇÃO':typewriter.active?'▣ MOSTRAR FALA INTEIRA':done?'✓ DEBATE CONCLUÍDO':'CONTINUAR A CENA  →';}
  }
  function describe(){
    document.body.dataset.offlineAdvance=settings.manual?'manual':'auto';
    const session=settings.session;
    if($('offline-position'))$('offline-position').textContent=`${String(session?.position||0).padStart(2,'0')} / ${session?.scenes.length||0} CENAS`;
    if($('offline-state'))$('offline-state').textContent=session?.closed?'CONCLUÍDO':settings.paused?'PAUSADO':!session?'PRONTO':settings.manual?'AGUARDANDO CLIQUE':'REPRODUÇÃO AUTOMÁTICA';
    refreshHint();
  }

  // A UI antiga é a mesma do modo real: um evento é entregue ao seu handler.
  // Eventos do juiz e abertura agora também ocupam a caixa de diálogo.
  function describeScene(scene){
    const event=scene[scene.length-1], d=event.data;
    if(event.type==='round_start'){
      $('speech-name').textContent=`ROUND ${String(d.round).padStart(2,'0')}`;
      $('speech-tag').textContent='NOVA PAUTA';
      $('speech-text').textContent=d.subtopic||fixture.preset.topic;
      $('gesture-display').textContent='✳ PRÓXIMO CONFRONTO';
    } else if(event.type==='evidence_released'){
      $('speech-name').textContent='NOVA PROVA NOS AUTOS';
      $('speech-tag').textContent=`SESSÃO ${d.round} · REVELAÇÃO DE DOCUMENTO`;
      $('speech-text').textContent=`A prova “${d.documentName}” foi liberada. Este documento não estava disponível nas sessões anteriores.`;
      $('gesture-display').textContent='▤ APRESENTAÇÃO DE NOVA EVIDÊNCIA';
    } else if(event.type==='judgment'){
      $('speech-name').textContent='JUIZ ELIAS';
      $('speech-tag').textContent=`VEREDITO DO ROUND ${d.round} · ${d.scoreA} × ${d.scoreB}`;
      $('speech-text').textContent=d.reason;
      $('gesture-display').textContent='⚖ DECISÃO JUSTIFICADA';
    } else if(event.type==='case_verdict'){
      $('speech-name').textContent='JUIZ ELIAS';
      $('speech-tag').textContent='DECISÃO FINAL DO CASO · SIMULADA';
      $('speech-text').textContent=d.reason;
      $('gesture-display').textContent='⚖ PROVAS E LACUNAS';
    } else if(event.type==='finished' && fixture.verdict){
      $('speech-name').textContent='TRIBUNAL SIMULADO';
      $('speech-tag').textContent='ENCERRAMENTO · FICTÍCIO';
      $('speech-text').textContent=fixture.verdict.reason;
      $('gesture-display').textContent='⚖ FIM DO CASO';
    } else if(event.type==='finished'){
      $('speech-name').textContent='FIM DO DEBATE';
      $('speech-tag').textContent='RESULTADO FINAL · SIMULADO';
      $('speech-text').textContent=`Placar final: Lia ${d.totalA} × ${d.totalB} Dante. Esta avaliação foi escrita previamente para o teste visual.`;
      $('gesture-display').textContent='✦ DEMONSTRAÇÃO ENCERRADA';
    }
  }
  class OfflineEventSource {
    constructor(url){
      this.url=url;this.onmessage=null;this.onerror=null;this.closed=false;
      this.scenes=buildScenes(settings.session?.config||fixture.preset);
      this.position=0;this.timer=null;
      settings.session=this;settings.count=0;settings.paused=false;
      describe();this.schedule(200);
    }
    schedule(ms){
      clearTimeout(this.timer);
      if(this.closed||settings.paused||this.position>=this.scenes.length)return;
      this.timer=setTimeout(()=>this.next(),ms);
    }
    next(){
      if(this.closed||settings.paused||this.position>=this.scenes.length)return;
      clearTimeout(this.timer);
      typewriter.stop();
      const scene=this.scenes[this.position++];
      for(const evt of scene)this.onmessage?.({data:JSON.stringify(evt)});
      describeScene(scene);
      typewriter.start($('speech-text')?.textContent||'');
      settings.count=this.position;describe();
      // Modo manual espera explicitamente pelo próximo clique.
      if(!settings.manual && this.position<this.scenes.length) {
        const last=scene[scene.length-1].type;
        const visualMinimum=last==='turn'?3800:last==='judgment'?3900:last==='judging'?2000:2600;
        const textMinimum=typewriter.chars.length*settings.textDelay;
        this.schedule(Math.max(visualMinimum, textMinimum+900)/Math.max(.2,settings.speed));
      }
      if(this.position>=this.scenes.length){
        // A sessão final é encerrada pelo próprio aplicativo, preservando o juiz.
        this.closed=true;typewriter.reveal();describe();
      }
    }
    close(){clearTimeout(this.timer);this.closed=true;typewriter.stop();describe();}
  }

  async function api(route,options={}){
    const method=String(options.method||'GET').toUpperCase();
    if(route==='/api/config')return {hasNimKey:false,hasWebSearch:false,ragEmbeddings:false,models:[
      {id:'simulado-lia',label:'OFFLINE · Lia (texto fixo)'},
      {id:'simulado-dante',label:'OFFLINE · Dante (texto fixo)'},
      {id:'simulado-juiz',label:'OFFLINE · Juiz (notas fixas)'}]};
    if(route==='/api/documents')return {documents:fixture.documents||[]};
    if(route==='/api/scenarios/singular')return {preset:structuredClone(fixture.preset)};
    if(route==='/api/debates' && method==='POST'){
      const config=structuredClone(fixture.preset);
      settings.session?.close();settings.session={config,close:()=>{}};return {id:'roteiro-local',config};
    }
    if(route==='/api/debates/roteiro-local/control' && method==='POST'){
      const command=JSON.parse(options.body||'{}').action;
      if(command==='cancel')settings.session?.close();
      if(command==='pause'){settings.paused=true;clearTimeout(settings.session?.timer);}
      if(command==='resume'){settings.paused=false;if(!settings.manual)settings.session?.schedule(300);}
      describe();return {ok:true};
    }
    if(route.startsWith('/api/'))throw Error('Esta função requer o servidor. O HTML local testa apenas o visual.');
    throw Error('Operação indisponível offline.');
  }

  function advance(){
    const now=Date.now();if(now-lastInput<95)return;lastInput=now;
    const session=settings.session;
    if(!session){$('start-singular')?.click();return;}
    if(session.closed)return;
    if(typewriter.reveal())return;
    if(settings.paused)return;
    session.next();
  }
  window.ContrapontoOffline={api,settings,OfflineEventSource,advance,get typing(){return typewriter.active;}};
  window.EventSource=OfflineEventSource;
  window.addEventListener('DOMContentLoaded',()=>{
    window.CONTRAPONTO_ANIMATION_SPEED=settings.speed;
    document.documentElement.style.setProperty('--motion-rate',String(1/settings.speed));
    $('offline-next')?.addEventListener('click',advance);
    $('dialogue')?.addEventListener('click',advance);
    $('dialogue')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();advance();}});
    document.addEventListener('keydown',e=>{
      if(!['Space','ArrowRight'].includes(e.code)||e.repeat||e.altKey||e.ctrlKey||e.metaKey)return;
      const target=e.target;
      if(target?.closest?.('input,textarea,select,button,[contenteditable="true"],summary'))return;
      e.preventDefault();advance();
    });
    $('offline-replay')?.addEventListener('click',()=>{
      settings.session?.close();settings.paused=false;settings.count=0;typewriter.stop();
      $('reset')?.click();setTimeout(()=>$('start-singular')?.click(),120);
    });
    const advanceMode=$('offline-advance-mode');
    advanceMode?.addEventListener('change',()=>{
      settings.manual=advanceMode.value==='manual';
      clearTimeout(settings.session?.timer);
      if(!settings.manual&&!settings.paused)settings.session?.schedule(1800);
      describe();
    });
    $('offline-speed')?.addEventListener('change',e=>{
      settings.speed=Number(e.target.value)||1;
      window.CONTRAPONTO_ANIMATION_SPEED=settings.speed;
      document.documentElement.style.setProperty('--motion-rate',String(1/settings.speed));
      describe();
    });
    $('offline-text-speed')?.addEventListener('change',e=>{
      settings.textDelay=Number(e.target.value);
      describe();
    });
    const mode=$('mode');if(mode){mode.value='singular';mode.querySelectorAll('option').forEach(o=>o.disabled=o.value!=='singular');}
    const formatSelector=$('offline-demo-format');
    formatSelector?.addEventListener('change',()=>{
      settings.session?.close();settings.session=null;typewriter.stop();settings.count=0;
      fixture = formatSelector.value==='court' ? window.CONTRAPONTO_COURT_SCENARIO : window.CONTRAPONTO_SCENARIO;
      $('debate-format').value=fixture.preset.format||'debate';
      $('debate-format').dispatchEvent(new Event('change'));
      $('start-singular').hidden=false;
      $('topic').readOnly=true;
      $('topic').value=fixture.preset.topic;
      $('offline-banner-caption').textContent=fixture.verdict?'TRIBUNAL FICTÍCIO · 4 SESSÕES · 3 REVELAÇÕES · VEREDITO SIMULADO':'DEBATE DE IDEIAS · 5 ROUNDS · 20 FALAS';
      $('mode-note').textContent=fixture.verdict?'TRIBUNAL FICTÍCIO: provas e veredito previamente escritos. Nenhum LLM analisa documentos aqui.':'DEBATE SINGULAR: falas previamente escritas. Nenhum LLM envolvido.';
      $('offline-next').textContent='▶ COMEÇAR DEMONSTRAÇÃO';
      describe();
    });
    for(const id of ['model-a','model-b','model-judge','document-file','memory-query','memory-button']){
      const element=$(id);if(element)element.disabled=true;
    }
    $('start').hidden=true;
    $('start-singular').textContent='▶ INICIAR DEMONSTRAÇÃO';
    $('connection').textContent='● VISUAL OFFLINE · SEM NIM';
    $('mode-note').textContent='Roteiro fixo: 5 rounds, 20 falas e 5 avaliações. Nenhuma chamada de IA.';
    $('dialogue').tabIndex=0;
    $('dialogue').title='Clique para revelar o texto ou avançar a cena';
    describe();
  });
})();
