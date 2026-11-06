/* CONTRAPONTO / Frontend sem dependências. O navegador nunca recebe a chave NVIDIA. */
import { $, node, toast, api, optionList } from './ui/dom.js';
import { formConfig, renderRoundTopics } from './ui/configuration.js';
import { artUrl, poseName, eyesName } from './ui/character-assets.js';
import { SpriteDirector } from './ui/sprite-director.js';
import { PerformanceDirector } from './ui/performance-director.js';
import { breakdownFromJudgments, breakdownFromCourtVerdict } from './ui/breakdown-policy.js';
import { createJudgeInteraction } from './ui/judge-interaction.js';

const audio = new window.ContrapontoAudio();
// Voz enviada pelo usuário. Pré-carrega da pasta pública sem API ou modelo local.
audio.registerBundledCue('objection','/assets/audio/objection-voice.mp3')
  .then(()=>{if(document.getElementById('cue-status'))refreshCueStatus();});
const cinema = new window.ContrapontoCinema($('arena'), audio);
const sprites = new SpriteDirector();
sprites.audio=audio;
const performance = new PerformanceDirector();
const names = { neutral:'Neutro', confident:'Confiante', thinking:'Pensativo', surprised:'Surpreso', frustrated:'Frustrado', excited:'Animado', breakdown:'Descabelando' };
const gestures = { idle:'Ouvindo', point:'Apontando', 'open-hand':'Gesticulando', 'arms-crossed':'Braços cruzados', 'slam-desk':'Batida dramática' };
const state = { id:null, es:null, playing:false, paused:false, waitingForAdvance:false, speechActive:false, speechTimer:null, turnChunks:[], turnChunkIndex:0, activeTurnChunks:false, seenTurnKeys:new Set(), count:0, rounds:3, judged:0, lastTurn:null, localAvatars:{ A:{}, B:{} }, config:null, docs:[], evidencePlan:{}, releasedIds:new Set(), evidenceLog:[], previewTimers:[], judgments:[], lastBreakdown:null, lastCaseVerdict:null };
const judgeInteraction=createJudgeInteraction({audio,sprites,canInteract:()=>!state.speechActive&&!state.activeTurnChunks,onComment:({text,round,automatic})=>{
 if((automatic||state.waitingForAdvance)&&!state.activeTurnChunks){$('speech-name').textContent='JUIZ ELIAS';$('speech-tag').textContent=round?`COMENTÁRIO DO ROUND ${round}`:'COMENTÁRIO DO JUIZ';$('speech-text').textContent=text;$('gesture-display').textContent='⚖ COMENTÁRIO · PONTUAÇÃO INALTERADA';}
}});
// ── Configurações persistíveis: importação/exportação e aplicação à cena. ──
function applyFormConfig(c) {
 $('topic').value=c.topic||'';
 for(const [i,l] of ['a','b'].entries()){
  const a=c.agents?.[i]||{};
  for(const field of ['name','position','viewpoint','role','objective','instructions','personality','color','model']){
   const el=$(`${field==='personality'?'persona':field}-${l}`);
   if(el&&a[field]!==undefined)el.value=a[field];
  }
 }
 for(const [id,key] of [['rounds','rounds'],['exchanges','exchanges'],['word-limit','wordLimit'],['turn-timeout','turnTimeoutSec'],['mode','mode'],['model-judge','judgeModel']]){
  if(c[key]!==undefined)$(id).value=String(c[key]);
 }
 for (const [id,key] of [['debate-format','format'],['case-title','caseTitle'],['case-allegation','allegation'],['case-jurisdiction','jurisdiction'],['case-standard','proofStandard']]) if($(id)&&c[key]!==undefined)$(id).value=c[key];
 updateFormat();
 for(const [id,key] of [['allow-web','allowWeb'],['allow-rag','allowRag'],['allow-past','allowPastDebates']]){if(c[key]!==undefined)$(id).checked=!!c[key];}
 state.evidencePlan=Object.fromEntries((c.caseEvidencePlan||[]).map(p=>[p.documentId,p.releaseRound]));
 renderRoundTopics(c.roundTopics||[]);renderCaseDocuments();applyConfig(formConfig());updateMode();
}
async function startSingular() {
 if(state.playing)return;
 try{
  const {preset}=await api('/api/scenarios/singular');
  applyFormConfig(preset);
  toast('Roteiro singular carregado: 5 rounds, 20 falas fixas e juiz simulado. Nenhuma IA será chamada.');
  await begin();
 }catch(e){toast(e.message);}
}
function exportConfig(){
 const content=JSON.stringify({schemaVersion:1,...formConfig()},null,2);
 const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));
 const a=node('a');a.href=url;a.download='contraponto-config.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
async function importConfig(file){
 if(!file)return;
 try{
  if(file.size>50000)throw new Error('Configuração maior que 50 KB.');
  const parsed=JSON.parse(await file.text());
  if(!parsed||typeof parsed.topic!=='string'||!Array.isArray(parsed.agents)||parsed.agents.length!==2)throw new Error('JSON de debate inválido.');
  if(parsed.mode==='singular')throw new Error('Use o botão Debate Singular para carregar o roteiro fixo.');
  applyFormConfig(parsed);toast('Configuração importada. Confira os campos antes de iniciar.');
 }catch(e){toast('Não foi possível importar: '+e.message);}finally{$('import-config').value='';}
}
// ── Renderização dos dois lados e configuração da arena ──
function applyConfig(c) {
 state.config=c;
 document.body.dataset.debateFormat=c.format||'debate';state.rounds=c.rounds;
 if($('stage-round-label'))$('stage-round-label').textContent=c.format==='court'?'SESSÃO':'ROUND';
 $('topic-display').textContent=c.format==='court'?(c.caseTitle||c.topic):c.topic;$('round-subtopic-display').textContent=`PAUTA GERAL · ${c.roundTopics?.[0]||'SUBTÓPICOS OPCIONAIS'}`;$('total-rounds').textContent=String(c.rounds).padStart(2,'0');$('stats-rounds').textContent=String(c.rounds).padStart(2,'0');
 c.agents.forEach((a,i)=>{const s=i?'b':'a'; const letter=i?'B':'A';$(`display-name-${s}`).textContent=a.name.toUpperCase();$(`display-position-${s}`).textContent=a.position.toUpperCase();$(`duelist-${s}`).style.setProperty('--tone',a.color);});
 $('round-pips').replaceChildren(...Array.from({length:c.rounds},()=>node('span','pip')));
}
function clearVisuals() {
 performance.cancel();sprites.stopAll();sprites.resetVariety();sprites.judgeAccent('idle');judgeInteraction.reset();state.waitingForAdvance=false;state.turnChunks=[];state.turnChunkIndex=0;state.activeTurnChunks=false;state.seenTurnKeys.clear();state.speechActive=false;clearTimeout(state.speechTimer);
 cancelPreview();cinema.reset(); audio.stop();
 state.count=0;state.judged=0;state.lastTurn=null;state.judgments=[];state.lastBreakdown=null;state.lastCaseVerdict=null;$('transcript').replaceChildren();
 const empty=node('div','empty');empty.append(node('span',null,'◎'));const txt=node('div');txt.append(node('strong',null,'A arena ainda está em silêncio.'),node('small',null,'Os argumentos serão exibidos aqui, rodada por rodada.'));empty.append(txt);$('transcript').append(empty);
 $('stats-turns').textContent='00';$('transcript-count').textContent='00 REGISTROS';$('current-round').textContent='00';$('progress-fill').style.width='0%';$('progress-text').textContent='0%';$('playback').textContent='0 INTERVENÇÕES';$('round-pips').replaceChildren();
 $('judge-messages').replaceChildren(node('div','judge-hint','✦ O juiz avalia cada rodada: raciocínio, evidências, refutação e clareza.'));
 $('verdict').hidden=true; $('court-verdict-details').hidden=true; $('debate-scores').hidden=false;$('round-subtopic-display').textContent='PAUTA: AGUARDANDO CONFIGURAÇÃO';$('speech-name').textContent='ARENA PRONTA';$('speech-tag').textContent='SUA VEZ DE CONFIGURAR';$('speech-text').textContent='Dois modelos. Posições opostas. Um juiz imparcial. Escolha o tema e dê início ao debate.';$('gesture-display').textContent='✳ AGUARDANDO PRIMEIRO ROUND';
 ['a','b'].forEach(s=>{const el=$(`duelist-${s}`);el.classList.remove('speaking','listening');el.dataset.emotion='neutral';el.dataset.gesture='idle';$(`reaction-${s}`).classList.remove('show');});
 resetCharacterArt();
}
function updateAudioMood() {
 const labels={calm:'AMBIENTE / ARGUMENTAÇÃO',intense:'TRILHA / CONFRONTO',suspense:'TRILHA / DELIBERAÇÃO',victory:'TRILHA / DESFECHO'};
 $('audio-mood').textContent=audio.musicOn ? (labels[audio.intensity]||'TRILHA ORIGINAL') : 'TRILHA DESLIGADA · EFEITOS '+(audio.sfxOn?'ON':'OFF');
 document.querySelector('.audio-wave')?.classList.toggle('playing',audio.musicOn && !state.paused);
}
function cancelPreview() {
 for(const id of state.previewTimers)clearTimeout(id);
 state.previewTimers=[];
}
// ── Prévia cinematográfica local — nunca chama LLM ──
function previewScene() {
 if(state.playing)return;
 sprites.stopAll();
 cancelPreview();audio.unlock();void audio.prepareCue('objection');cinema.reset();
 const c=formConfig();if(!c.topic)c.topic='Uma ideia sob debate';applyConfig(c);
 const a={speaker:'A',name:c.agents[0].name,round:1,action:'argument',emotion:'confident',gesture:'open-hand',speech:'Uma boa hipótese exige evidências e uma explicação convincente.'};
 const b={speaker:'B',name:c.agents[1].name,round:1,action:'objection',emotion:'frustrated',gesture:'point',speech:'Objeção! Precisamos diferenciar uma hipótese interessante de um fato comprovado.'};
 const q={speaker:'A',name:c.agents[0].name,round:1,action:'question',emotion:'thinking',gesture:'open-hand',speech:'Então, qual evidência mudaria sua posição neste assunto?'};
 $('status').textContent='PRÉVIA VISUAL / SEM IA';
 cinema.round(1);$('current-round').textContent='01';updateAudioMood();
 const later=(fn,ms)=>state.previewTimers.push(setTimeout(fn,ms));
 later(()=>{signalVisual(a);$('speech-tag').textContent='PRÉVIA VISUAL · SEM IA';updateAudioMood();},1230);
 later(()=>{signalVisual(b);$('speech-tag').textContent='PRÉVIA VISUAL · SEM IA';updateAudioMood();},3450);
 later(()=>{signalVisual(q);$('speech-tag').textContent='PRÉVIA VISUAL · SEM IA';updateAudioMood();},5700);
 later(()=>{sprites.stopAll();cinema.judging(1);$('speech-name').textContent='MAGISTRADO';$('speech-tag').textContent='PRÉVIA DE DELIBERAÇÃO · SEM IA';$('speech-text').textContent='O juiz examina os argumentos antes de decidir. Esta cena apenas demonstra os efeitos.';updateAudioMood();},7900);
 later(()=>{resetCharacterArt();cinema.reset();audio.setIntensity('calm');updateAudioMood();setStatus('PRÉVIA CONCLUÍDA');},10100);
}
function setStatus(status){$('status').textContent=status.toUpperCase();}
function setPlaying(playing){state.playing=playing;$('start').disabled=playing;$('pause').disabled=!playing;$('preview-fx').disabled=playing;$('start-singular').disabled=playing;$('export-config').disabled=playing;$('import-config').disabled=playing;$('pause').textContent=state.paused?'▶ CONTINUAR':'Ⅱ PAUSAR';if($('advance-turn')){$('advance-turn').hidden=!playing;$('advance-turn').disabled=!state.waitingForAdvance;}for (const input of document.querySelectorAll('.setup input,.setup select,.setup textarea'))input.disabled=playing;}
function appendEntry({title,text,kind,side,foot,links}){
 const wrap=node('div','entry '+(kind==='judge'?'entry-judge':''));wrap.style.setProperty('--c',side==='A'?(state.config?.agents[0].color||'#55c9ee'):side==='B'?(state.config?.agents[1].color||'#f47d86'):'#f4c78d');
 const top=node('div');top.append(node('strong',null,title),node('span','entry-type',kind==='judge'?'⚖ JULGAMENTO':kind==='tool'?'FERRAMENTA':kind==='system'?'SISTEMA':'FALA'));wrap.append(top,node('p',null,text));if(foot)wrap.append(node('small',null,foot));
 if(Array.isArray(links)&&links.length){const line=node('small',null,'Fontes: '+links.slice(0,4).join(' · '));wrap.append(line);}
 if($('transcript').querySelector('.empty'))$('transcript').replaceChildren();$('transcript').append(wrap);$('transcript').scrollTop=$('transcript').scrollHeight;
 $('transcript-count').textContent=`${$('transcript').children.length} REGISTROS`;
}
function reaction(side, word, ms=1550) {
 const el=$(`reaction-${side.toLowerCase()}`);el.textContent=word;el.classList.add('show');clearTimeout(el.timer);el.timer=setTimeout(()=>el.classList.remove('show'),ms);
}
function canonicalTurn(turn) {
 const index=String(turn.speaker).toUpperCase()==='A'?0:String(turn.speaker).toUpperCase()==='B'?1:-1;
 const agent=index>=0?state.config?.agents?.[index]:null;
 return agent?{...turn,speaker:index===0?'A':'B',name:agent.name,position:agent.position}:turn;
}
/** Divide a fala normalizada em blocos equilibrados, preferindo limites de frase e palavra. */
function splitTurnIntoChunks(speech, max=110) {
 const normalized=String(speech||'').trim().replace(/\s+/g,' ');
 if(!normalized)return [''];
 max=Math.max(1,Math.floor(Number(max)||110));
 const words=[...normalized.matchAll(/\S+/g)];
 const boundaries=[];
 for(let i=1;i<words.length;i++){
  boundaries.push({at:words[i].index,kind:/[.!?…][\"'»”)]*$/.test(words[i-1][0])?'sentence':'word'});
 }
 // Uma palavra maior que o limite ganha pontos de corte Unicode como fallback.
 for(const match of words){
  const word=match[0],start=match.index;
  if(word.length>max){let offset=0;for(const char of word){offset+=char.length;if(offset<word.length)boundaries.push({at:start+offset,kind:'long-word'});}}
 }
 boundaries.sort((a,b)=>a.at-b.at);
 const points=[...boundaries,{at:normalized.length,kind:'end'}];
 const chunks=[];let from=0;
 while(from<normalized.length){
  const remaining=normalized.length-from;
  if(remaining<=max){chunks.push(normalized.slice(from));break;}
  let slots=Math.ceil(remaining/max);
  let feasible=[];
  while(!feasible.length&&slots<=remaining){
   feasible=points.filter(p=>p.at>from&&p.at-from<=max&&remaining-(p.at-from)<=(slots-1)*max);
   if(!feasible.length)slots++;
  }
  const target=remaining/slots;
  if(!feasible.length){
   // Não parte um surrogate pair quando max é menor que um ponto de código.
   let cut=from,offset=0;
   for(const char of Array.from(normalized.slice(from))){if(offset+char.length>max&&offset>0)break;offset+=char.length;cut=from+offset;if(offset>=max)break;}
   if(cut===from)cut=from+Array.from(normalized.slice(from))[0].length;
   chunks.push(normalized.slice(from,cut));from=cut;continue;
  }
  let best=feasible[0],bestScore=Infinity;
  for(const point of feasible){
   const length=point.at-from,piece=normalized.slice(from,point.at);
   const wordCount=(piece.trim().match(/\S+/g)||[]).length;
   let score=Math.abs(length-target);
   if(point.kind==='sentence')score-=Math.min(5,max*.06);
   if(wordCount===1&&length<max*.45)score+=max*.55;
   if(score<bestScore){best=point;bestScore=score;}
  }
  chunks.push(normalized.slice(from,best.at));from=best.at;
 }
 return chunks.length?chunks:[normalized];
}
function speechDuration(turn) {
 const words=String(turn.speech||'').trim().split(/\s+/).filter(Boolean).length;
 return Math.min(7.2,Math.max(2.5,1.4+words*.055));
}
// A/B usam os retratos Lia/Dante do pacote importado.
// Um upload do usuário tem prioridade: não sobrescrevemos imagens pessoais.
function setPortrait(side, emotion='neutral', gesture='idle', action='argument') {
 const files=state.localAvatars[side.toUpperCase()], img=$(`custom-avatar-${side}`);
 const pack=$(`pack-avatar-${side}`), svg=$(`duelist-${side}`).querySelector('.default-avatar');
 const custom=(action==='objection'&&files.objection)||(gesture!=='idle'&&files[gesture])||files[emotion]||files.idle||files.default;
 if(custom) {
  img.src=custom;img.hidden=false;pack.hidden=true;pack.parentElement?.classList.remove('v22-portrait');svg.style.display='none';return;
 }
 img.hidden=true;img.removeAttribute('src');pack.hidden=false;delete pack.dataset.animation;delete pack.dataset.frame;svg.style.display='none';
 const latest=sprites.defaultStill(side);
 const image=latest || artUrl(side,'pose',poseName({emotion,gesture,action}));
 if(latest){pack.dataset.motionSet='v22';pack.parentElement?.classList.add('v22-portrait');}
 if(pack.getAttribute('src')!==image)pack.src=image;
}
// Face Card do pacote do outro chat: acionado apenas por ações especiais.
let facecardTimer;
function showFacecard(turn){
 const overlay=$('facecard-overlay'),side=turn.speaker?.toLowerCase();
 clearTimeout(facecardTimer);sprites.stop('facecard-hide');overlay.classList.remove('visible');
 if(!['a','b'].includes(side)||!['objection','rebuttal','question','concession'].includes(turn.action)||!cinema.enabled||cinema.motionQuery?.matches)return;
 const image=artUrl(side,'eyes',eyesName(turn));
 $('facecard-image').src=image;
 $('facecard-caption').textContent=({objection:'OBJEÇÃO!',rebuttal:'REFUTAÇÃO!',question:'PERGUNTA!',concession:'CONCESSÃO!'})[turn.action];
 overlay.dataset.side=side;
 const selectedPath=$('cutin-path')?.value||'auto';
 overlay.dataset.path=selectedPath==='auto' ? (turn.action==='objection'||turn.action==='question'?'straight':'diagonal') : selectedPath;
 overlay.style.setProperty('--face-tone',side==='a'?'#57b4f9':'#fa566a');
 void overlay.offsetWidth;overlay.classList.add('visible');
 sprites.facecard(side,turn.action,$('facecard-image'));
 sprites.after('facecard-hide',560,()=>{overlay.classList.remove('visible');sprites.stop('facecard');});
}
function resetCharacterArt(){
 performance.cancel();sprites.stopAll();
 delete $('arena').dataset.singularBlock;
 clearTimeout(facecardTimer);$('facecard-overlay').classList.remove('visible');
 for(const side of ['a','b'])setPortrait(side,'neutral','idle','argument');
}
// Cada bloco é uma cena isolada: gesto do locutor e, depois, no máximo uma
// reação silenciosa do ouvinte. A ação é recalculada a partir deste trecho.
function signalSingularBlock(turn, visibleSpeech=turn.speech, blockIndex=0){
 audio.stopSpeech();
 const active=turn.speaker.toLowerCase(),other=active==='a'?'b':'a';
 const actor=$(`duelist-${active}`),listener=$(`duelist-${other}`);
 const objectionText=/(?:\bobjeç(?:ão|o|ões)\b|\bobjection\b|\bpela ordem\b|\bponto de ordem\b|\bprotesto\b)/iu.test(visibleSpeech);
 const explicitObjection=/(?:^\s*(?:objeç(?:ão|o)|objection)(?=\s|[!,:.]|$)|\bpela ordem\b|\bponto de ordem\b|\bprotesto\b)/iu.test(visibleSpeech);
 const objectionHere=(turn.action==='objection'&&objectionText)||explicitObjection;
 const blockAction=objectionHere?'objection':turn.action==='objection'?'argument':turn.action;
 const cardAction=objectionHere?'objection':
  /[?¿]/u.test(visibleSpeech)?'question':
  /\b(?:discordo|não procede|incorreto|refuto|porém|contudo|entretanto)\b/iu.test(visibleSpeech)?'rebuttal':
  /\b(?:concordo|reconheço|admito|concedo|faz sentido|tem razão)\b/iu.test(visibleSpeech)?'concession':null;
 const blockTurn={...turn,action:blockAction,blockText:visibleSpeech,
  gesture:objectionHere?(turn.gesture==='slam-desk'?'slam-desk':'point'):turn.gesture};
 audio.setPerformanceMood(blockTurn);
 $('arena').dataset.singularBlock='true';
 clearTimeout(facecardTimer);$('facecard-overlay').classList.remove('visible');sprites.stop('facecard');
 for(const side of ['a','b']){const bubble=$(`reaction-${side}`);clearTimeout(bubble.timer);bubble.classList.remove('show');bubble.textContent='';}
 cinema.cancel();cinema.clearPerformers();cinema.focus(active,`${turn.name} · BLOCO ${blockIndex+1}`);
 performance.cancel({preserveSequence:false});
 for(const side of ['a','b']){
  const el=$(`duelist-${side}`);el.classList.remove('speaking','listening','reacting','perform','react-now','anticipation');
  el.dataset.emotion='neutral';el.dataset.gesture='idle';el.querySelector('.portrait').style.removeProperty('animation');
 }
 actor.dataset.emotion=turn.emotion;actor.dataset.gesture=blockTurn.gesture||'idle';
 const listenerEmotion=objectionHere?'surprised':blockAction==='question'?'thinking':blockAction==='concession'?'confident':blockAction==='rebuttal'?'frustrated':
  /\b(?:concordo|reconheço|faz sentido|justo)\b/iu.test(visibleSpeech)?'confident':
  /\b(?:porém|contudo|entretanto|discordo|não procede|incorreto)\b/iu.test(visibleSpeech)?'thinking':'neutral';
 listener.dataset.emotion=listenerEmotion;listener.dataset.gesture='idle';
 setPortrait(active,turn.emotion,blockTurn.gesture,blockAction);
 setPortrait(other,listenerEmotion,'idle','listening');
 let facecardStarted=false;
 const animation=sprites.singularBlock(blockTurn,blockIndex,visibleSpeech,(side,track,role,duration)=>{
  const cleanups=[];
  const audioCleanup=audio.animationCue(side,track,role,duration);
  if(typeof audioCleanup==='function')cleanups.push(audioCleanup);
  // O efeito especial pertence só ao início da entrega do bloco que contém
  // a objeção; a reação silenciosa do ouvinte não recebe fala nem efeito.
  if(cardAction&&side===active&&role==='speaker'&&!facecardStarted){
   facecardStarted=true;
   if(objectionHere){
    const effectCleanup=audio.playAnimationEffect?.('objection',side,duration);
    if(typeof effectCleanup==='function')cleanups.push(effectCleanup);
    const objection=$('objection');objection.classList.remove('show');void objection.offsetWidth;objection.classList.add('show');
    cleanups.push(()=>objection.classList.remove('show'));
   }
   const overlay=$('facecard-overlay');
   clearTimeout(facecardTimer);overlay.classList.remove('visible','singular-action');
   const image=artUrl(side,'eyes',eyesName({...turn,action:cardAction}));
   $('facecard-image').src=image;$('facecard-caption').textContent=({objection:'OBJEÇÃO!',rebuttal:'REFUTAÇÃO!',question:'PERGUNTA!',concession:'CONCESSÃO!'})[cardAction];
   overlay.dataset.side=side;
   const selectedPath=$('cutin-path')?.value||'auto';
   overlay.dataset.path=selectedPath==='auto'?(cardAction==='objection'||cardAction==='question'?'straight':'diagonal'):selectedPath;
   overlay.style.setProperty('--face-tone',side==='a'?'#57b4f9':'#fa566a');
   void overlay.offsetWidth;overlay.classList.add('visible','singular-action');
   sprites.facecard(side,cardAction,$('facecard-image'));
   cleanups.push(()=>{overlay.classList.remove('visible','singular-action');sprites.stop('facecard');});
  }
  if(!cleanups.length)return null;
  return ()=>{for(const cleanup of cleanups.splice(0))cleanup();};
 });
 const visibleGesture={talking:'Gesticulando',confident:'Confiante',frustrated:'Frustrado',surprised:'Surpreso',thinking:'Pensativo',objection:'Objeção'}[animation];
 $('speech-name').textContent=turn.name.toUpperCase();
 $('speech-tag').textContent=`ROUND ${turn.round} / ${blockAction.toUpperCase()} · BLOCO ${blockIndex+1}`;
 const text=$('speech-text');text.textContent=visibleSpeech;text.classList.remove('speech-reveal');void text.offsetWidth;text.classList.add('speech-reveal');
 $('gesture-display').textContent=`✳ ${names[turn.emotion]||'Neutro'} · ${visibleGesture||gestures[turn.gesture]||'Ouvindo'}`;
}
// ── Direção visual acionada pelos eventos do Harness ──
function signalVisual(turn, visibleSpeech=turn.speech) {
 if(state.playing)return signalSingularBlock(turn,visibleSpeech,state.turnChunkIndex||0);
 audio.setPerformanceMood(turn);
 audio.stopSpeech();
 delete $('arena').dataset.singularBlock;
 const active=turn.speaker.toLowerCase(),other=active==='a'?'b':'a';const actor=$(`duelist-${active}`),listener=$(`duelist-${other}`);
 for(const side of ['a','b'])$(`duelist-${side}`).querySelector('.portrait').style.removeProperty('animation');
 actor.classList.add('speaking');actor.classList.remove('listening');listener.classList.add('listening');listener.classList.remove('speaking');
 actor.dataset.emotion=turn.emotion;actor.dataset.gesture=turn.gesture;setPortrait(active,turn.emotion,turn.gesture,turn.action);
 // Reação do ouvinte é governada pela interface, sem chamada adicional ao LLM.
 listener.dataset.emotion=turn.action==='objection'?'surprised':turn.action==='question'?'thinking':turn.action==='concession'?'confident':turn.action==='rebuttal'?'frustrated':'neutral';listener.dataset.gesture='idle';setPortrait(other,listener.dataset.emotion,'idle','listening');
 if(turn.action==='objection'){reaction(other,'!?');}
 else if(turn.action==='question')reaction(other,'HMM...');
 else if(turn.action==='rebuttal')reaction(other,'...');
 else if(turn.action==='concession')reaction(other,'BOA!');
 cinema.turn(turn);sprites.turn(turn);performance.turn(turn);sprites.judgeAction(turn.action==='objection'?'order':'observe');showFacecard(turn);
 $('speech-name').textContent=turn.name.toUpperCase();$('speech-tag').textContent=`ROUND ${turn.round} / ${turn.action.toUpperCase()}`;
 const text=$('speech-text');text.textContent=visibleSpeech;text.classList.remove('speech-reveal');void text.offsetWidth;text.classList.add('speech-reveal');
 $('gesture-display').textContent=`✳ ${names[turn.emotion]||'Neutro'} · ${gestures[turn.gesture]||'Ouvindo'}`;
}
function setProgress() {const percent=Math.round(state.judged/state.rounds*100);$('progress-fill').style.width=percent+'%';$('progress-text').textContent=percent+'%';[...$('round-pips').children].forEach((e,i)=>e.classList.toggle('done',i<state.judged));}
// A decisão dramática usa somente o sinal estruturado do juiz, nunca detectores
// de palavras como "perdendo" ou "péssimo". Reação ilustrativa, não fato objetivo.
function triggerBreakdown(detail) {
 if(!detail?.side || !['a','b'].includes(detail.side)) return false;
 if(!sprites.breakdown(detail.side)) return false;
 $(`duelist-${detail.side}`).dataset.emotion='breakdown';
 $(`duelist-${detail.side}`).dataset.gesture='hair-grab';
 reaction(detail.side,'NÃO PODE SER!',2600);
 $('gesture-display').textContent='✳ PRESSÃO MÁXIMA · REAÇÃO DRAMÁTICA';
 return true;
}

// ── Contrato SSE: eventos de debate → elementos visuais ──
function onEvent(evt){const {type,data}=evt;
 switch(type){
 case 'started':applyConfig(data.config);audio.startMusic();updateAudioMood();setStatus(data.config.format==='court'?'TRIBUNAL SIMULADO':data.config.mode==='singular'?'ROTEIRO SINGULAR · OFFLINE':data.config.mode==='demo'?'PRÉVIA SIMULADA':'NVIDIA NIM · SESSÃO');break;
 case 'round_start':state.activeTurnChunks=false;state.turnChunks=[];state.turnChunkIndex=0;$('evidence-reveal')?.classList.remove('visible');if(state.config?.format==='court'){state.judged=data.round-1;setProgress();}resetCharacterArt();sprites.judgeAction(data.round===1?'opening':'order');$('round-subtopic-display').textContent=`PAUTA DA ${data.courtSession?'SESSÃO':'RODADA'} ${data.round} · ${data.subtopic||state.config.topic}`;cinema.round(data.round);updateAudioMood();$('current-round').textContent=String(data.round).padStart(2,'0');setStatus(`ROUND ${data.round} / ${data.total}`);break;
 case 'thinking':state.activeTurnChunks=false;state.turnChunks=[];state.turnChunkIndex=0;audio.stopSpeech();state.speechActive=false;performance.cancel({preserveSequence:false});sprites.judgeAction('observe');if(state.config?.mode==='singular'){sprites.stopAll();$('arena').dataset.singularBlock='true';cinema.cancel();cinema.clearPerformers();for(const side of ['a','b']){const el=$(`duelist-${side}`);el.classList.remove('speaking','listening','reacting','perform','react-now','anticipation');el.dataset.emotion='neutral';el.dataset.gesture='idle';setPortrait(side,'neutral','idle','listening');}}else{setPortrait(String(data.speaker).toLowerCase(),'thinking','idle','argument');cinema.thinking(data.speaker);sprites.thinking(data.speaker);}setStatus(`${data.speaker} ESTÁ PENSANDO`);break;
 case 'turn':{const turn=canonicalTurn(data);const key=JSON.stringify([turn.round,turn.speaker,turn.name,turn.action,turn.speech]);if(state.seenTurnKeys.has(key))break;state.seenTurnKeys.add(key);state.lastTurn=turn;$('evidence-reveal')?.classList.remove('visible');state.count++;state.waitingForAdvance=true;state.activeTurnChunks=true;state.turnChunks=state.activeTurnChunks?splitTurnIntoChunks(turn.speech):[];state.turnChunkIndex=0;state.speechActive=true;clearTimeout(state.speechTimer);state.speechTimer=setTimeout(()=>{state.speechActive=false;},speechDuration(turn)*1000+150);if($('advance-turn')){$('advance-turn').disabled=!state.waitingForAdvance;$('advance-turn').textContent=state.waitingForAdvance?(state.turnChunks.length>1?`▶ PRÓXIMO BLOCO 2/${state.turnChunks.length}`:'▶ CONTINUAR DEBATE'):'▶ AVANÇAR FALA';$('advance-turn').setAttribute('aria-label',state.waitingForAdvance?(state.turnChunks.length>1?`Mostrar bloco 2 de ${state.turnChunks.length}`:'Continuar debate'):'Avançar fala');}signalVisual(turn,state.activeTurnChunks?state.turnChunks[0]:turn.speech);updateAudioMood();$('stats-turns').textContent=String(state.count).padStart(2,'0');$('playback').textContent=`${state.count} INTERVENÇÕES`;appendEntry({title:turn.name,text:turn.speech,kind:'turn',side:turn.speaker,foot:`Rodada ${turn.round} · ${state.config.roundTopics?.[turn.round-1]||state.config.topic} · ${turn.action} · ${turn.emotion}${state.config.mode==='singular'?' · TEXTO FIXO OFFLINE':''}`,links:turn.citations});break;}
 case 'evidence_released': {
  state.releasedIds.add(data.documentId);state.evidenceLog.push(data);
  const doc=state.docs.find(d=>d.id===data.documentId);
  const title=doc?.name||`Documento ${data.documentId}`;
  $('speech-name').textContent='NOVA PROVA NOS AUTOS';
  $('speech-tag').textContent=`SESSÃO ${data.round} · ${data.reason==='manual'?'LIBERAÇÃO MANUAL':'LIBERAÇÃO PROGRAMADA'}`;
  $('speech-text').textContent=`O documento “${title}” foi liberado. Acusação e defesa podem consultá-lo nas próximas falas.`;
  $('gesture-display').textContent='▤ NOVA EVIDÊNCIA · DOCUMENTO DISPONÍVEL';
  const reveal=$('evidence-reveal');if(reveal){
   $('evidence-reveal-name').textContent=title;$('evidence-reveal-session').textContent=`SESSÃO ${data.round}`;
   reveal.classList.remove('visible');void reveal.offsetWidth;reveal.classList.add('visible');
  }
  sprites.judgeAction('order'); audio.cue('paper');
  appendEntry({title:'▤ Nova prova liberada',text:title,kind:'system',foot:`Sessão ${data.round} · ${data.reason==='manual'?'liberada manualmente':'conforme programação'}`});
  renderCaseDocuments(); renderEvidenceTimeline();setStatus('PROVA REVELADA');break;
 }
 case 'tool':appendEntry({title:`${data.speaker} consultou ${data.tool}`,text:JSON.stringify(data.result).slice(0,250),kind:'tool',side:data.speaker});break;
 case 'judging':state.activeTurnChunks=false;state.turnChunks=[];state.turnChunkIndex=0;audio.stopSpeech();state.speechActive=false;$('evidence-reveal')?.classList.remove('visible');performance.judging();sprites.stopAll();sprites.judgeAction('thinking');clearTimeout(facecardTimer);$('facecard-overlay').classList.remove('visible');cinema.judging(data.round);updateAudioMood();setStatus('JUIZ AVALIANDO');$('speech-name').textContent='MAGISTRADO';$('speech-tag').textContent=`AVALIAÇÃO DO ROUND ${data.round}`;$('speech-text').textContent=state.config?.format==='court'?'Examinando os documentos do caso, as objeções e o padrão de prova indicado...':'Analisando coerência, evidências, refutações e clareza dos debatedores...';break;
 case 'judgment':performance.judging();sprites.judgeAction('judgment');cinema.judgment(data);updateAudioMood();judgeInteraction.setJudgment(data);state.speechActive=true;clearTimeout(state.speechTimer);state.speechTimer=setTimeout(()=>{state.speechActive=false;},Math.min(7800,Math.max(1300,String(data.reason||'').trim().split(/\s+/).filter(Boolean).length/2.15*1000+250)));state.waitingForAdvance=state.config?.mode!=='singular'||data.round<state.rounds;if($('advance-turn')){$('advance-turn').disabled=!state.waitingForAdvance;$('advance-turn').textContent='▶ PRÓXIMA FALA';}state.judged++;setProgress();{
 state.judgments.push(data);
 state.lastBreakdown=breakdownFromJudgments(state.judgments);
 if(state.lastBreakdown) triggerBreakdown(state.lastBreakdown);
 const win=data.winner==='empate'?'Empate':`Vitória: ${state.config.agents[data.winner==='A'?0:1].name}`;
 const wrap=node('div','judge-note');wrap.append(node('strong',null,`ROUND ${data.round} · ${win} · ${data.scoreA} × ${data.scoreB}`),node('p',null,data.reason));$('judge-messages').prepend(wrap);
 appendEntry({title:`Juiz · Round ${data.round}`,text:data.reason,kind:'judge',foot:`A: ${data.scoreA} · B: ${data.scoreB}${data.simulated?' · PONTUAÇÃO SIMULADA':''}`});
 if(data.winner==='empate'){reaction('a','EMPATE',1300);reaction('b','EMPATE',1300);}else reaction(data.winner.toLowerCase(),'VENCEU!',1800);
 }break;
 case 'case_verdict':state.lastCaseVerdict=data;state.judged=state.rounds;setProgress();sprites.judgeAction('judgment');showCaseVerdict(data);judgeInteraction.setJudgment(data);state.speechActive=true;clearTimeout(state.speechTimer);state.speechTimer=setTimeout(()=>{state.speechActive=false;},Math.min(7800,Math.max(1300,String(data.reason||'').trim().split(/\s+/).filter(Boolean).length/2.15*1000+250)));$('speech-name').textContent='JUIZ ELIAS';$('speech-tag').textContent='DECISÃO FINAL · TRIBUNAL SIMULADO';$('speech-text').textContent=data.reason;$('gesture-display').textContent='⚖ FUNDAMENTAÇÃO E PROVAS';appendEntry({title:'Juiz Elias · decisão final',text:data.reason,kind:'judge',foot:`${data.simulated?'SIMULAÇÃO, NÃO DECISÃO REAL':'Avaliação de LLM, não decisão jurídica'}`});break;
 case 'finished':$('evidence-reveal')?.classList.remove('visible');performance.judging();sprites.stopAll();sprites.judgeAction('verdict');clearTimeout(facecardTimer);$('facecard-overlay').classList.remove('visible');cinema.finished(state.config?.format==='court'?'empate':data.winner);updateAudioMood();if(state.config?.format!=='court')showVerdict(data);setStatus(state.config?.format==='court'?'PROCESSO CONCLUÍDO':'DEBATE ENCERRADO');stopSession({preserveFinale:true});cancelPreview();{
  // O backend pode emitir `finished` imediatamente após o último julgamento;
  // reiniciamos a reação na cena final para que não seja interrompida.
  const finalReaction=state.config?.format==='court' ? breakdownFromCourtVerdict(state.lastCaseVerdict) : state.lastBreakdown;
  if(finalReaction) triggerBreakdown(finalReaction);
}state.previewTimers.push(setTimeout(()=>{audio.stop();updateAudioMood();},2700));break;
 case 'warning':toast(data.message);break;
 case 'error':performance.cancel();sprites.stopAll();cinema.reset();audio.stop();setStatus(data.cancelled?'CANCELADO':'ERRO NA EXECUÇÃO');appendEntry({title:'Execução interrompida',text:data.message,kind:'system'});toast(data.message);stopSession();break;
 }
}
/** Tribunal: não utiliza pontuação de oratória nem dá sentença real. */
function showCaseVerdict(v){
 $('verdict').hidden=false;$('debate-scores').hidden=true;$('court-verdict-details').hidden=false;
 const labels={culpado:'ACUSAÇÃO CONSIDERADA PROVADA (SIMULAÇÃO)',nao_comprovado:'ACUSAÇÃO NÃO COMPROVADA',indeterminado:'PROVAS INCONCLUSIVAS'};
 $('winner').textContent=labels[v.decision]||'DECISÃO INCONCLUSIVA';
 $('winner-reason').textContent=v.reason||'Não houve fundamentação disponível.';
 const details=$('court-verdict-details');details.replaceChildren();
 const add=(heading,entries)=>{if(!Array.isArray(entries)||!entries.length)return;details.append(node('strong',null,heading));for(const item of entries)details.append(node('p',null,'• '+item));};
 if(v.standardAssessment)details.append(node('p','court-proof-standard','⚖ Padrão de prova: '+v.standardAssessment));
 add('Fatos avaliados',v.findings);add('Provas ausentes ou dúvidas',v.missingEvidence);
 if(Array.isArray(v.evidence)&&v.evidence.length){
   details.append(node('strong',null,'Fontes que o juiz citou'));
   for(const e of v.evidence){
     const block=node('div','court-evidence-item');
     block.append(node('strong',null,(e.document||'Documento')+' · '+e.sourceId));
     block.append(node('p',null,String(e.excerpt||'').slice(0,440)));
     details.append(block);
   }
 }else if(v.citations?.length)details.append(node('small',null,'Trechos citados: '+v.citations.join(' · ')));
 if(v.partiallyReviewed)details.append(node('p','court-evidence-warning','⚠ Leitura parcial: alguns documentos possuem trechos adicionais que não couberam no contexto do juiz.'));
 $('judge-disclaimer').textContent=v.simulated?'DEMONSTRAÇÃO PRÉ-ESCRITA. NENHUM MODELO ANALISOU DOCUMENTOS.':'VEREDITO GERADO EXCLUSIVAMENTE PELO MODELO JUIZ. SIMULAÇÃO SEM VALIDADE JURÍDICA.';
}
function updateFormat(){
 const court=$('debate-format')?.value==='court';
 $('court-fields').hidden=!court;
 document.body.dataset.debateFormat=court?'court':'debate';
 if(court){$('position-a').value='acusação';$('position-b').value='defesa';$('role-a').value='promotor';$('role-b').value='advogado de defesa';
  // O painel fica recolhido por padrão para destacar a arena.
 }else {$('court-fields').open=false;}
 $('start-singular').hidden=court && !window.ContrapontoOffline;
 $('mode-note').textContent=court?'TRIBUNAL SIMULADO: você envia documentos e escolhe os modelos; SOMENTE a IA juiz decide no final. Modo Demo tem decisão pré-escrita.':'Debate de ideias: dois lados, rounds e juiz por rodada.';
 const hint=$('judge-messages');if(hint&&!state.playing)hint.replaceChildren(node('div','judge-hint',court?'⚖ No Tribunal, Elias não dá notas por rodada: o modelo juiz examina o dossiê e decide uma única vez, no final.':'✦ No Debate de Ideias, o juiz avalia argumentos e atribui notas por rodada.'));
}
function renderEvidenceTimeline(){
 const parent=$('court-evidence-timeline');if(!parent)return;
 parent.replaceChildren();
 if(!state.evidenceLog.length){parent.append(node('p','muted','Nenhuma prova liberada nesta execução.'));return;}
 for(const entry of state.evidenceLog){const doc=state.docs.find(d=>d.id===entry.documentId);
  const row=node('div','court-evidence-timeline-entry');
  row.append(node('span','court-session-dot','◆'),node('div',null,`SESSÃO ${entry.round} · ${doc?.name||entry.documentId}`));parent.append(row);}
}
function renderCaseDocuments(){
 const parent=$('case-documents');
 const selected=new Set([...parent.querySelectorAll('input:checked')].map(x=>x.value));
 parent.replaceChildren();const docs=state.docs.filter(d=>d.scope==='library');
 if(!docs.length){parent.append(node('p','muted','Nenhum documento. Envie provas na Biblioteca RAG.'));return;}
 for(const d of docs){
  const row=node('div','case-evidence-row');
  const label=node('label','case-doc-item');const check=node('input','case-document-check');
  check.type='checkbox';check.value=d.id;check.checked=selected.has(d.id)||state.config?.caseDocumentIds?.includes(d.id)&&state.playing;
  check.disabled=state.playing;
  label.append(check,node('span',null,`${d.name} · ${d.chunks} trechos`));
  const round=node('select','case-evidence-round');round.dataset.documentId=d.id;round.disabled=state.playing;
  for(let r=1;r<=Number($('rounds').value);r++){
   const option=node('option',null,`Sessão ${r}`);option.value=String(r);round.append(option);
  }
  round.value=String(Math.min(Number($('rounds').value),state.evidencePlan[d.id]||1));
  round.onchange=()=>{state.evidencePlan[d.id]=Number(round.value)};
  const button=node('button','case-evidence-release',state.releasedIds.has(d.id)?'✓ Liberada':'Liberar agora');
  button.type='button';button.disabled=!state.playing||state.releasedIds.has(d.id)||!state.config?.caseDocumentIds?.includes(d.id);
  button.onclick=async()=>{try{const result=await api(`/api/debates/${state.id}/evidence`,{
   method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({documentId:d.id})});
   if(!result.released)toast('Esta prova já estava disponível.');
  }catch(e){toast('Não foi possível liberar a prova: '+e.message);}};
  row.append(label,round,button);parent.append(row);
 }
}

function showVerdict(result){$('verdict').hidden=false;const winner=result.winner==='empate'?'EMPATE':state.config.agents[result.winner==='A'?0:1].name.toUpperCase();$('winner').textContent=winner;$('winner-reason').textContent=result.winner==='empate'?'Os dois lados terminaram com a mesma pontuação.':'Vencedor definido pela soma das notas atribuídas pelo juiz em cada rodada.';$('score-name-a').textContent=state.config.agents[0].name;$('score-name-b').textContent=state.config.agents[1].name;$('score-a').textContent=result.totalA;$('score-b').textContent=result.totalB;$('judge-disclaimer').textContent=state.config.mode!=='nim'?'PLACAR SIMULADO. Nenhuma avaliação real foi feita.':'Pontuação de LLM, não equivale a uma verificação objetiva da verdade.';}
function stopSession({preserveFinale=false}={}){if(!preserveFinale){sprites.stopAll();sprites.judgeAccent('idle');}if(state.paused){audio.pause(false).then(()=>{sprites.pause(false);delete $('arena').dataset.animationPaused;});}else delete $('arena').dataset.animationPaused;if(!preserveFinale)audio.stop();updateAudioMood();state.es?.close();state.es=null;state.paused=false;setPlaying(false);}
// ── Ciclo de vida da sessão: iniciar, pausar, reiniciar ──
async function begin(){if(state.playing)return;try{
 audio.unlock();
 const config=formConfig();if(config.format==='court' && config.mode==='nim' && !config.caseDocumentIds.length)throw new Error('Selecione os documentos do caso no painel de processo.');if(config.topic.length<8)throw new Error('Escreva um tema com pelo menos oito caracteres.');
 // O gesto de iniciar desbloqueia o Web Audio; prepara também a voz Objection incluída.
 if(audio.musicOn)audio.startMusic();
 void audio.prepareCue('objection');
 const response=await api('/api/debates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(config)});
 state.es?.close();state.id=response.id;state.paused=false;state.releasedIds=new Set();state.evidenceLog=[];clearVisuals();applyConfig(response.config);setPlaying(true);renderCaseDocuments();renderEvidenceTimeline();
 state.es=new EventSource(`/api/debates/${state.id}/events`);state.es.onmessage=e=>{try{onEvent(JSON.parse(e.data));}catch(err){console.error('Evento inválido',err);}};
 state.es.onerror=()=>{if(!state.playing)return;toast('Conexão perdida. Você pode consultar o debate novamente ao atualizar.');setStatus('CONEXÃO INTERROMPIDA');stopSession();};
 }catch(err){audio.stop();toast(err.message);}}
async function pause(){if(!state.id||!state.playing)return;try{const action=state.paused?'resume':'pause';await api(`/api/debates/${state.id}/control`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action})});const nextPaused=!state.paused;if(nextPaused){state.paused=true;sprites.pause(true);$('arena').dataset.animationPaused='true';await audio.pause(true);}else{await audio.pause(false);state.paused=false;sprites.pause(false);delete $('arena').dataset.animationPaused;}updateAudioMood();$('pause').textContent=state.paused?'▶ CONTINUAR':'Ⅱ PAUSAR';setStatus(state.paused?'PAUSADO':'RETOMADO');}catch(e){toast(e.message);}}
async function reset(){cancelPreview();performance.cancel();sprites.stopAll();if(state.playing&&state.id){try{await api(`/api/debates/${state.id}/control`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'cancel'})});}catch{}}stopSession();state.id=null;state.releasedIds=new Set();state.evidenceLog=[];clearVisuals();renderEvidenceTimeline();applyConfig(formConfig());setStatus('AGUARDANDO');}
// ── Biblioteca de documentos e avatares ──
async function refreshDocuments(){try{const {documents}=await api('/api/documents');state.docs=documents;renderCaseDocuments();$('doc-total').textContent=`${documents.length} ARQUIVO(S)`;$('documents').replaceChildren();if(!documents.length){$('documents').append(node('p','muted','Nenhum documento indexado.'));return;}for(const d of documents){if(d.scope==='past-debates')continue;const row=node('div','doc-item');row.append(node('span',null,`▤ ${d.name} · ${d.chunks} trechos`));const del=node('button',null,'×');del.title=`Excluir ${d.name}`;del.setAttribute('aria-label',`Excluir ${d.name}`);del.onclick=async()=>{try{await api(`/api/documents/${encodeURIComponent(d.id)}`,{method:'DELETE'});await refreshDocuments();toast('Documento excluído.');}catch(e){toast(e.message);}};row.append(del);$('documents').append(row);}}catch(e){toast(e.message);}}
async function uploadDocument(file){if(!file)return;if(file.size>3*1024*1024){toast('Limite de documento: 3 MB.');return;}toast('Processando documento...');try{const raw=await file.arrayBuffer();await api('/api/documents',{method:'POST',headers:{'X-Filename':encodeURIComponent(file.name)},body:raw});await refreshDocuments();toast(`Documento “${file.name}” indexado.`);}catch(e){toast('Erro no documento: '+e.message);}finally{$('document-file').value='';}}
async function searchDocs(){const query=$('memory-query').value.trim();if(!query)return;try{const {results}=await api('/api/search-memory',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query})});$('memory-results').replaceChildren();if(!results.length){$('memory-results').append(node('div','memory-result','Nenhum trecho relevante encontrado.'));return;}for(const item of results){const e=node('div','memory-result');e.append(node('b',null,item.document),node('div',null,item.text.slice(0,270)+'…'));$('memory-results').append(e);}}catch(e){toast(e.message);}}
function updateMode(){const mode=$('mode').value;$('mode-note').textContent=mode==='nim'?'NIM REAL: falas e avaliações via NVIDIA NIM; trilha, efeitos e animações reagem aos eventos do debate.':mode==='singular'?'DEBATE SINGULAR: roteiro pré-escrito com 5 rounds e 20 falas. Sem chamada de modelo; demonstra a mesma direção de cena e áudio.':'PRÉVIA: falas e notas simuladas para verificar componentes, sem IA local.';}
async function avatarFiles(letter, input){
 const files=[...input.files];if(!files.length)return;
 const allowed=['neutral','confident','thinking','surprised','frustrated','breakdown','excited','point','open-hand','arms-crossed','slam-desk','objection','idle'];
 const store=state.localAvatars[letter];let loaded=0;
 for(const file of files.slice(0,14)){
  if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>2*1024*1024){toast('Use PNG, JPEG ou WebP de até 2 MB por sprite.');continue;}
  const stem=file.name.toLowerCase().replace(/\.[^.]+$/,'').replace(/[^a-z-]/g,'');
  const key=allowed.includes(stem)?stem:'default';
  if(store[key])URL.revokeObjectURL(store[key]);store[key]=URL.createObjectURL(file);loaded++;
 }
 if(loaded){setPortrait(letter.toLowerCase(),'neutral','idle','default');toast(`${loaded} imagem(ns) carregada(s). Para poses, nomeie arquivos: thinking.png, objection.png...`);}
 input.value='';
}

function refreshCueStatus(){
 const cue=$('cue-type').value,info=audio.cueInfo(cue);
 $('cue-status').textContent=`${info.kind}: ${info.name}`;
}

// ── Inicialização e ligações dos botões da interface ──

// Estúdio de prévia dos 24 tracks: não altera o estado do debate nem chama API.
function setupSpriteLab(){
 if(!sprites.manifest)return;
 const person=$('lab-person'),select=$('lab-track'),img=$('lab-image');
 const names={idle:'Idle · respiração e piscadas',talking:'Talking · fala e gestos',thinking:'Thinking · reflexão',confident:'Confident · confiança',objection:'Objection! · acusação',surprised:'Surprised · surpresa',frustrated:'Frustrated · frustração',breakdown:'Breakdown · descabelando',
  'objection/completa':'Objeção completa (olhos e pose)',
  'objection/olhos':'Close dos olhos · objeção',
  'objection/corpo':'Gesto de objeção',
  'negacao/corpo':'Negação e frustração',
  'negacao/rosto_olhos':'Rosto · negação',
  'argumento_forte/corpo':'Argumento forte',
  'argumento_forte/rosto_olhos':'Rosto · argumento forte',
  'conversa_loop/fala':'Ciclo de fala',
  'conversa_loop/escuta':'Ciclo de escuta',
  'conversa_loop/rosto':'Rosto · fala',
  'conversa_gestos/corpo':'Gestos de argumentação',
  'conversa_gestos/rosto':'Rosto · gestos'
 };
 function refresh(){
  sprites.stop('lab');select.replaceChildren();
  const source=person.value==='elias'?sprites.manifest.animations:sprites.actorAnimations;
  const tracks=Object.keys(source).filter(k=>k.startsWith(person.value+'/'));
  for(const track of tracks){const o=document.createElement('option');o.value=track.slice(person.value.length+1);o.textContent=names[o.value]||o.value;select.append(o);}
  select.value='idle';showFirst();
 }
 function showFirst(){
  sprites.stop('lab');const f=sprites.track(person.value,select.value);
  if(f.length){img.src=sprites.url(f[0].frame);img.dataset.frame='1';$('lab-title').textContent=names[select.value]||select.value;$('lab-count').textContent=`1 / ${f.length} quadros`;}
 }
 person.addEventListener('change',refresh);select.addEventListener('change',showFirst);
 $('lab-play').addEventListener('click',()=>{
  let seq=0;
  const f=sprites.track(person.value,select.value);
  sprites.play('lab',person.value,select.value,img,{onEnd:()=>$('lab-count').textContent=`${f.length} / ${f.length} quadros`});
  const observer=new MutationObserver(()=>{
   if(!sprites.players.has('lab')){observer.disconnect();return;}
   seq=Number(img.dataset.frame||1);$('lab-count').textContent=`${seq} / ${f.length} quadros`;
  });
  observer.observe(img,{attributes:true,attributeFilter:['data-frame']});
  setTimeout(()=>observer.disconnect(),20000);
 });
 $('lab-stop').addEventListener('click',()=>sprites.stop('lab'));
 refresh();
}

async function init(){
 try { await sprites.load(); } catch(e) { console.warn('Pacote v12 indisponível: utilizando poses estáticas.',e); }
 setupSpriteLab();
 try{const cfg=await api('/api/config');for(const id of ['model-a','model-b','model-judge'])optionList($(id),cfg.models,cfg.models[0]?.id);
 $('connection').textContent=cfg.hasNimKey?'● NIM CONFIGURADO':'● SEM CHAVE NIM';if(!cfg.hasWebSearch){$('allow-web').disabled=true;$('allow-web').title='Configure BRAVE_SEARCH_API_KEY no servidor';}if(cfg.ragEmbeddings)$('doc-total').title='Embeddings semânticos da NVIDIA habilitados';
 }catch(e){toast(`Servidor indisponível: ${e.message}`);}
 renderRoundTopics();applyConfig(formConfig());resetCharacterArt();await refreshDocuments();
 const advanceButton=node('button','advance-turn','▶ PRÓXIMA FALA');advanceButton.id='advance-turn';advanceButton.type='button';advanceButton.hidden=true;advanceButton.disabled=true;advanceButton.setAttribute('aria-label','Avançar para a próxima fala do debate');$('pause').after(advanceButton);
 advanceButton.onclick=async()=>{
  if(!state.id||!state.playing||state.paused||!state.waitingForAdvance)return;
  if(state.activeTurnChunks&&state.turnChunkIndex<state.turnChunks.length-1){
   state.turnChunkIndex++;
   const block=state.turnChunks[state.turnChunkIndex];
   signalSingularBlock(state.lastTurn,block,state.turnChunkIndex);
   state.speechActive=true;clearTimeout(state.speechTimer);state.speechTimer=setTimeout(()=>{state.speechActive=false;},speechDuration({...state.lastTurn,speech:block})*1000+150);
   advanceButton.textContent=state.turnChunkIndex<state.turnChunks.length-1
    ?`▶ PRÓXIMO BLOCO ${state.turnChunkIndex+2}/${state.turnChunks.length}`
    :'▶ CONTINUAR DEBATE';
   advanceButton.setAttribute('aria-label',state.turnChunkIndex<state.turnChunks.length-1?`Mostrar bloco ${state.turnChunkIndex+2} de ${state.turnChunks.length}`:'Continuar debate');
   return;
  }
  state.waitingForAdvance=false;advanceButton.disabled=true;advanceButton.textContent='… PREPARANDO FALA';
  try{await api(`/api/debates/${state.id}/control`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'advance'})});}
  catch(error){state.waitingForAdvance=true;advanceButton.disabled=false;advanceButton.textContent=state.activeTurnChunks?'▶ CONTINUAR DEBATE':'▶ PRÓXIMA FALA';advanceButton.setAttribute('aria-label',state.activeTurnChunks?'Continuar debate':'Próxima fala');toast(error.message);}
 };
 $('start').onclick=begin;$('pause').onclick=pause;$('reset').onclick=reset;$('preview-fx').onclick=previewScene;$('start-singular').onclick=startSingular;$('export-config').onclick=exportConfig;$('import-config').onchange=e=>importConfig(e.target.files?.[0]);
 $('sound-toggle').onclick=()=>{audio.setSfx(!audio.sfxOn);$('sound-toggle').setAttribute('aria-pressed',String(audio.sfxOn));$('sound-toggle').textContent=audio.sfxOn?'♫ EFEITOS':'♫ EFEITOS OFF';if(audio.sfxOn)audio.cue('round');updateAudioMood();};
 $('music-toggle').onclick=()=>{audio.setMusic(!audio.musicOn);$('music-toggle').setAttribute('aria-pressed',String(audio.musicOn));$('music-toggle').textContent=audio.musicOn?'♪ MÚSICA':'♪ MÚSICA OFF';updateAudioMood();};
 $('cinema-toggle').onclick=()=>{cinema.setEnabled(!cinema.enabled);$('cinema-toggle').setAttribute('aria-pressed',String(cinema.enabled));$('cinema-toggle').textContent=cinema.enabled?'◉ CÂMERA':'◉ CÂMERA OFF';};
 $('music-volume').oninput=()=>{audio.setMusicVolume(Number($('music-volume').value)/100);$('music-volume-value').textContent=$('music-volume').value+'%';};
 $('effects-volume').oninput=()=>{audio.setSfxVolume(Number($('effects-volume').value)/100);$('effects-volume-value').textContent=$('effects-volume').value+'%';};
 $('dynamic-audio').onchange=()=>{audio.setDynamic($('dynamic-audio').checked);updateAudioMood();};
 $('ambient-audio').onchange=()=>audio.setAmbience($('ambient-audio').checked);
 $('cue-preview').onclick=async()=>{
  audio.unlock();const cue=$('cue-type').value;
  if(!audio.sfxOn){$('cue-status').textContent='Ative EFEITOS para ouvir.';return;}
  await audio.prepareCue(cue);
  audio.cue(cue,{side:'a'});
  $('cue-status').textContent='Prévia: '+audio.cueInfo(cue).kind+' · '+audio.cueInfo(cue).name;
 };
 $('cue-reset').onclick=()=>{const cue=$('cue-type').value;audio.removeCustomCue(cue);refreshCueStatus();};
 $('cue-type').onchange=refreshCueStatus;
 $('use-objection-voice').onchange=()=>{audio.setBundledEnabled($('use-objection-voice').checked);refreshCueStatus();};
 $('cue-file').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;
   const cue=$('cue-type').value;try{const info=await audio.setCustomCue(cue,file);$('cue-status').textContent=info.name+' · '+info.duration.toFixed(1)+'s · somente neste navegador';toast('Som carregado para '+cue+'.');}
   catch(error){$('cue-status').textContent='Não foi possível carregar: '+error.message;toast(error.message);}
   finally{e.target.value='';}
 };

 $('debate-format').onchange=()=>{updateFormat();if(!state.playing)applyConfig(formConfig());};
 $('open-case-library').onclick=()=>{const d=$('document-file').closest('details');d.open=true;d.scrollIntoView({behavior:'smooth',block:'nearest'});};
 $('director-mode').onchange=()=>cinema.setMode($('director-mode').value);$('music-palette').onchange=()=>{audio.setPalette($('music-palette').value);if(audio.musicOn)audio.cue('round');};$('volume').oninput=()=>audio.setVolume(Number($('volume').value)/100);$('mode').onchange=updateMode;$('document-file').onchange=async e=>{const files=[...e.target.files].slice(0,40);for(const f of files)await uploadDocument(f);};$('memory-button').onclick=searchDocs;$('memory-query').onkeydown=e=>{if(e.key==='Enter')searchDocs();};
 for(const l of ['a','b']){$(`avatar-${l}`).onchange=e=>avatarFiles(l.toUpperCase(),e.target);}
 $('rounds').addEventListener('change',()=>{renderRoundTopics();renderCaseDocuments();});
 for(const id of ['name-a','name-b','position-a','position-b','color-a','color-b','topic','rounds'])$(id).addEventListener('input',()=>{if(!state.playing)applyConfig(formConfig());});
 updateMode();updateAudioMood();refreshCueStatus();
}
init();

// Cenários puramente visuais: não afetam prompts, ferramentas nem o Harness.
document.getElementById('scene-preset')?.addEventListener('change', (event) => {
  document.getElementById('arena').dataset.scene = event.target.value;
});
