import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {breakdownFromJudgments,breakdownFromCourtVerdict} from '../app/ui/breakdown-policy.js';
import {SpriteDirector} from '../app/ui/sprite-director.js';
import {createDebateEngine} from '../harness/harness.js';
const root=resolve(import.meta.dirname,'..');
const j=(round,scoreA,scoreB)=>({round,scoreA,scoreB});

test('Breakdown raro: só derrota expressiva ou sequência com desvantagem acumulada',()=>{
 assert.equal(breakdownFromJudgments([]),null);
 assert.equal(breakdownFromJudgments([j(1,8,9)]),null);
 assert.equal(breakdownFromJudgments([j(1,4,7)]).side,'a');
 assert.equal(breakdownFromJudgments([j(1,9,4)]).side,'b');
 assert.equal(breakdownFromJudgments([j(1,6,9)]),null);
 assert.equal(breakdownFromJudgments([j(1,8,6),j(2,6,7),j(3,8,7)]),null);
 const sustained=breakdownFromJudgments([j(1,8,7),j(2,7,9),j(3,7,10)]);
 assert.equal(sustained.side,'a');assert.equal(sustained.reason,'derrotas_consecutivas');
 assert.equal(breakdownFromJudgments([j(1,8,8),j(2,8,9)]),null);
 assert.equal(breakdownFromJudgments([j(1,4,9),j(2,8,8)]),null);
 assert.equal(breakdownFromJudgments([j(1,4,9),j(2,NaN,8)]),null);
 assert.equal(breakdownFromJudgments([j(1,5,9),j(2,5,9)]),null); // cooldown: round seguinte
 assert.equal(breakdownFromJudgments([j(1,5,9),j(2,5,9),j(3,5,9)]),null);
 assert.equal(breakdownFromJudgments([j(1,5,9),j(2,5,9),j(3,5,9),j(4,5,9)]).side,'a');
});

test('Tribunal só aciona reação quando há veredito adverso estruturado e não simulado',()=>{
 assert.deepEqual(breakdownFromCourtVerdict({decision:'culpado',simulated:false}),{side:'b',reason:'decisao_final_adversa'});
 assert.equal(breakdownFromCourtVerdict({decision:'nao_comprovado',simulated:false}).side,'a');
 assert.equal(breakdownFromCourtVerdict({decision:'indeterminado',simulated:false}),null);
 assert.equal(breakdownFromCourtVerdict({decision:'culpado',simulated:true}),null);
 assert.equal(breakdownFromCourtVerdict(null),null);
});

test('16 estados novos constam no manifesto e mantêm transparência real',()=>{
 const m=JSON.parse(readFileSync(join(root,'app/assets/actors-v22/manifest.json'),'utf8'));
 assert.equal(Object.keys(m.animations).length,16);
 assert.ok(m.states.includes('breakdown'));
 for(const who of ['lia','dante']){
  const seq=m.animations[`${who}/breakdown`];assert.equal(seq.length,8);
  for(const f of seq){
   assert.match(f.frame,/actors-v22\/(lia|dante)\/breakdown\/0[1-8]\.png$/);
   const buf=readFileSync(join(root,'app/assets',f.frame));
   assert.equal(buf.toString('hex',0,8),'89504e470d0a1a0a');
   assert.equal(buf[25],6); // PNG color type RGBA
  }
 }
});

test('Diretor não reescreve quadro final nem sobrescreve avatar personalizado',()=>{
 const fake={getElementById: id => id==='custom-avatar-a'?{hidden:false}:null};
 const previous=global.window;global.window={matchMedia:()=>({matches:false})};
 try{
  const director=new SpriteDirector(fake);director.manifest={animations:{}};
  director.actorAnimations=JSON.parse(readFileSync(join(root,'app/assets/actors-v22/manifest.json'),'utf8')).animations;
  assert.equal(director.breakdown('a'),false); // personalizado tem prioridade
  assert.equal(director.url('actors-v22/lia/breakdown/08.png'),'/assets/actors-v22/lia/breakdown/08.png');
  assert.equal(director.url('actors-v22/lia/breakdown/../../other.png'),null);
 }finally{global.window=previous;}
});

test('Gatilho do juiz está ligado à renderização ao concluir',()=>{
 const app=readFileSync(join(root,'app/app.js'),'utf8');
 const engine=readFileSync(join(root,'harness/harness.js'),'utf8');
 const offline=readFileSync(join(root,'offline/app.bundle.js'),'utf8');
 for(const source of [app,offline]) {
  assert.match(source,/breakdownFromJudgments/);
  assert.match(source,/sprites\.breakdown/);
  assert.match(source,/if\(finalReaction\) triggerBreakdown/);
 }
 assert.match(engine,/if \(round < config.rounds && breakdownFromJudgments/);
});


test('Harness preserva tempo de exibição da reação antes do próximo round no modo NIM simulado',async()=>{
 let judgeIndex=0;const events=[];
 const chat=async ({model})=>model==='judge-mock'
  ? {content:JSON.stringify(++judgeIndex===1?{scoreA:4,scoreB:9,reason:'refutação forte'}:{scoreA:8,scoreB:8,reason:'empate'})}
  : {content:JSON.stringify({speech:'Um argumento completo.',emotion:'neutral',action:'argument',gesture:'idle',citations:[]})};
 const engine=createDebateEngine({chat,memorySave:async()=>{},delayMs:1});
 const cfg={topic:'O abacaxi deve estar na pizza?',mode:'nim',rounds:2,exchanges:1,
  allowWeb:false,allowRag:false,judgeModel:'judge-mock',agents:[
    {name:'Lia',model:'lia-mock',position:'a favor'},{name:'Dante',model:'dante-mock',position:'contra'}]};
 const state=await engine.runDebate(cfg,{emit:(type,data)=>events.push({type,round:data?.round,t:performance.now()})});
 const firstJudge=events.find(e=>e.type==='judgment'&&e.round===1);
 const nextRound=events.find(e=>e.type==='round_start'&&e.round===2);
 assert.equal(state.status,'finished');assert.ok(firstJudge&&nextRound);
 assert.ok(nextRound.t-firstJudge.t>=2000,`Reação cortada: ${nextRound.t-firstJudge.t} ms`);
});
