import test from 'node:test';
import assert from 'node:assert/strict';
import { createDebateEngine, normalizeTurn, parseObject } from '../harness/harness.js';
import { validateConfig } from '../harness/config.js';
import { debaterMessages } from '../harness/prompts.js';

const config = (mode='nim') => validateConfig({
 topic:'A IA ajuda a criatividade humana?',rounds:2,exchanges:2,wordLimit:80,mode,allowWeb:true,allowRag:true,
 agents:[{name:'Alex',model:'mock-a',position:'a favor',personality:'cientista'},{name:'Nova',model:'mock-b',position:'contra',personality:'provocador'}],judgeModel:'mock-judge'
});
test('validação exige dois agentes e impõe limites aos rounds',()=>{
 assert.throws(()=>validateConfig({topic:'um tema completo',agents:[]}),/exatamente dois/);
 const c=validateConfig({...config('demo'),rounds:99,exchanges:99,wordLimit:500});
 assert.equal(c.rounds,8);assert.equal(c.exchanges,4);assert.equal(c.wordLimit,250);
});
test('normalização restringe enum, texto e palavras',()=>{
 const turn=normalizeTurn({speech:'<b>Olá</b> este é um teste muito longo',emotion:'unsafe',gesture:'fly',action:'system',citations:['FABRICADA']},{id:'A',name:'Alex',position:'a favor'},1,4);
 assert.equal(turn.speech,'Olá este é um');assert.equal(turn.emotion,'neutral');assert.equal(turn.gesture,'idle');assert.equal(turn.action,'argument');
 assert.deepEqual(parseObject('```json\n{"speech":"Olá"}\n```'),{speech:'Olá'});
});
test('prompt inclui performance própria recente e pede variação coerente sem suprimir objeções',()=>{
 const c=config();
 const turns=[
  {speaker:'A',position:'a favor',speech:'Minha fala anterior.',emotion:'confident',gesture:'point',action:'argument'},
  {speaker:'B',position:'contra',speech:'A fala adversária.',emotion:'frustrated',gesture:'slam-desk',action:'objection'},
  {speaker:'A',position:'a favor',speech:'Minha fala mais recente.',emotion:'thinking',gesture:'arms-crossed',action:'rebuttal'}
 ];
 const prompt=JSON.parse(debaterMessages({config:c,agent:c.agents[0],turns,judgments:[],round:2,exchange:1})[1].content);
 assert.deepEqual(prompt.recentOwnPerformances.map(({emotion,gesture,action})=>({emotion,gesture,action})),[
  {emotion:'confident',gesture:'point',action:'argument'},
  {emotion:'thinking',gesture:'arms-crossed',action:'rebuttal'}
 ]);
 assert.equal(prompt.recentTurns[1].action,'objection');
 const system=debaterMessages({config:c,agent:c.agents[0],turns,judgments:[],round:2,exchange:1})[0].content;
 assert.match(system,/varie naturalmente/);
 assert.match(system,/faça objeções sempre que houver motivo substantivo/);
});
test('debate completo: alternância de ordem, juiz em cada round, pontuação final e memória',async()=>{
 const calls=[],events=[],saved=[];
 const chat=async ({model,messages})=>{
  calls.push({model,messages});
  if(model==='mock-judge')return{content:JSON.stringify({scoreA:8,scoreB:7,reason:'A argumentou melhor',feedbackA:'Bom',feedbackB:'Rever'})};
  return{content:JSON.stringify({speech:`Argumento de ${model}`,emotion:'confident',gesture:'point',action:'rebuttal',citations:[]})};
 };
 const engine=createDebateEngine({chat,memorySave:async state=>saved.push(state)});
 const state=await engine.runDebate(config(),{emit:(type,data)=>events.push({type,data})});
 assert.equal(state.status,'finished');assert.equal(state.turns.length,8);assert.equal(state.judgments.length,2);
 assert.equal(state.outcome.totalA,16);assert.equal(state.outcome.totalB,14);assert.equal(state.outcome.winner,'A');
 assert.deepEqual(state.turns.map(t=>t.speaker),['A','B','A','B','B','A','B','A']);
 assert.equal(calls.length,10);assert.equal(saved.length,1);
 assert.equal(events.filter(e=>e.type==='judgment').length,2);
});
test('debatedor usa search_memory com limite e só aceita citações verificadas',async()=>{
 const invocations=[];
 const chat=async ({messages})=>{
  invocations.push(messages);
  if(messages.length===2)return {content:null,tool_calls:[{id:'tool-1',type:'function',function:{name:'search_memory',arguments:'{"query":"IA"}'}}]};
  return{content:JSON.stringify({speech:'Evidência documento.',citations:['DOC:0','INVENTADO'],gesture:'open-hand',emotion:'thinking',action:'argument'})};
 };
 const engine=createDebateEngine({chat,memorySearch:async()=>[{sourceId:'DOC:0',document:'Relatório',text:'Conteúdo'}],delayMs:1});
 const result=await engine.generateTurn({config:config(),agent:config().agents[0],turns:[],judgments:[],round:1,exchange:1,emit:()=>{}});
 assert.deepEqual(result.citations,['DOC:0']);assert.equal(result.sources[0].title,'Relatório');assert.equal(invocations[1].at(-1).role,'tool');
});
test('quando juiz devolve JSON inválido, retorna erro claro sem placar falso',async()=>{
 const engine=createDebateEngine({chat:async ({model})=>({content:model==='mock-judge'?'desculpe':JSON.stringify({speech:'Fala'})}),memorySave:async()=>{}});
 const events=[];const c={...config(),rounds:1,exchanges:1};
 const state=await engine.runDebate(c,{emit:(type,data)=>events.push({type,data})});
 assert.equal(state.status,'error');assert.ok(events.find(e=>e.type==='error').data.message.includes('JSON'));
 assert.equal(events.some(e=>e.type==='finished'),false);
});
test('modo prévia nunca chama NVIDIA nem salva memória como real',async()=>{
 let calls=0,saves=0;const e=createDebateEngine({chat:async()=>{calls++;return{};},memorySave:async()=>saves++,delayMs:1});
 const c={...config('demo'),rounds:1,exchanges:1};const s=await e.runDebate(c);
 assert.equal(s.status,'finished');assert.equal(calls,0);assert.equal(saves,0);assert.equal(s.judgments[0].simulated,true);
});
test('cancelamento interrompe execução e não produz resultado final',async()=>{
 const ctrl=new AbortController();const events=[];
 const engine=createDebateEngine({chat:async()=>({content:'{"speech":"Ok"}'})});
 const state=await engine.runDebate(config(),{signal:ctrl.signal,gate:async()=>ctrl.abort(),emit:(type)=>events.push(type)});
 assert.equal(state.status,'cancelled');assert.equal(state.outcome,null);assert.ok(!events.includes('finished'));
});
