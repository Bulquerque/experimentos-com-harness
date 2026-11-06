import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../harness/config.js';
import { createDebateEngine } from '../harness/harness.js';
import { SINGULAR_PRESET, scriptedTurn, scriptedJudgment } from '../harness/singular.js';

const custom = {
  topic: 'Como diferentes tradições compreendem a verdade religiosa?', mode: 'nim', rounds: 2,
  exchanges: 1, wordLimit: 140, turnTimeoutSec: 90,
  roundTopics: ['Métodos de interpretação de textos', 'Pluralismo e diálogo'],
  agents: [
    {name:'Representante A',model:'mock-a',personality:'socrático',position:'tradição cristã',viewpoint:'perspectiva cristã',role:'Estudioso de teologia',objective:'Apresentar interpretação da própria tradição',instructions:'Evitar falar por todos os cristãos'},
    {name:'Representante B',model:'mock-b',personality:'cientista',position:'tradição islâmica',viewpoint:'perspectiva muçulmana',role:'Estudioso de teologia',objective:'Apresentar interpretação da própria tradição',instructions:'Evitar falar por todos os muçulmanos'}
  ],judgeModel:'mock-judge'
};
test('posições abertas, objetivo, papel, subtópicos e tempo são preservados na validação',()=>{
 const c=validateConfig(custom);
 assert.equal(c.agents[0].position,'tradição cristã');
 assert.equal(c.agents[1].position,'tradição islâmica');
 assert.equal(c.agents[0].role,'Estudioso de teologia');
 assert.match(c.agents[1].objective,/interpretação/);
 assert.deepEqual(c.roundTopics,['Métodos de interpretação de textos','Pluralismo e diálogo']);
 assert.equal(c.turnTimeoutSec,90);
});
test('cada round envia sua pauta e objetivos aos agentes, e ao juiz, via chat simulado', async()=>{
 const calls=[];const events=[];
 const chat=async ({model,messages})=>{
  calls.push({model,messages});
  return {content: model==='mock-judge' ? JSON.stringify({scoreA:8,scoreB:8,reason:'Equilíbrio',feedbackA:'Consistente',feedbackB:'Consistente'}) : JSON.stringify({speech:'Apresento uma interpretação contextual, sem generalizações.',emotion:'thinking',gesture:'idle',action:'argument'})};
 };
 const engine=createDebateEngine({chat,memorySave:async()=>{},delayMs:1});
 const state=await engine.runDebate(custom,{emit:(type,data)=>events.push({type,data})});
 assert.equal(state.status,'finished');assert.equal(state.turns.length,4);
 assert.deepEqual(events.filter(e=>e.type==='round_start').map(e=>e.data.subtopic),custom.roundTopics);
 assert.ok(calls.some(c=>c.model==='mock-a'&&c.messages[1]?.content?.includes('Métodos de interpretação de textos')));
 assert.ok(calls.some(c=>c.model==='mock-b'&&c.messages[1]?.content?.includes('Pluralismo e diálogo')));
 assert.ok(calls.some(c=>c.model==='mock-a'&&c.messages[1]?.content?.includes('Estudioso de teologia')));
 assert.ok(calls.some(c=>c.model==='mock-judge'&&c.messages.some(m=>m.content?.includes('Pluralismo e diálogo'))));
});
test('Debate Singular: 20 falas, 5 notas, ordem correta, sem chamar NIM ou memória',async()=>{
 let calls=0, saves=0;const events=[];
 const engine=createDebateEngine({chat:async()=>{calls++;throw Error('Nunca chamar NIM!');},memorySave:async()=>saves++,singularDelayMs:1});
 const state=await engine.runDebate(SINGULAR_PRESET,{emit:(type,data)=>events.push({type,data})});
 assert.equal(state.status,'finished');assert.equal(state.turns.length,20);assert.equal(state.judgments.length,5);
 assert.equal(state.outcome.totalA,43);assert.equal(state.outcome.totalB,42);assert.equal(state.outcome.winner,'A');
 assert.equal(calls,0);assert.equal(saves,0);
 assert.deepEqual(state.turns.map(t=>t.speaker),['A','B','A','B','B','A','B','A','A','B','A','B','B','A','B','A','A','B','A','B']);
 assert.ok(state.turns.some(t=>t.action==='objection'));
 assert.ok(state.turns.some(t=>t.action==='concession'));
 assert.equal(events.filter(e=>e.type==='judgment').length,5);
 assert.equal(events.at(-1).type,'finished');
 assert.equal(events.find(e=>e.type==='round_start').data.subtopic,SINGULAR_PRESET.roundTopics[0]);
 assert.match(scriptedTurn(1,1,'A').speech,/criatividade/i);
 assert.equal(scriptedJudgment(2).winner,'B');
 assert.equal(scriptedJudgment(5).winner,'A');
});
test('roteiro singular impede falsificação com tema e subtópicos diferentes',()=>{
 assert.throws(()=>validateConfig({...SINGULAR_PRESET,topic:'Outro tema completo'}),/roteiro fixo/);
 assert.throws(()=>validateConfig({...SINGULAR_PRESET,roundTopics:['Outro tópico']}),/roteiro fixo/);
 assert.throws(()=>validateConfig({...SINGULAR_PRESET,agents:[{...SINGULAR_PRESET.agents[0],position:'contra'},SINGULAR_PRESET.agents[1]]}),/roteiro fixo/);
});
test('limites de tamanho impedem prompts e conteúdo descontrolados',()=>{
 const c=validateConfig({...custom,turnTimeoutSec:2000,rounds:25,roundTopics:Array.from({length:50},()=> 'x'.repeat(500)),agents:custom.agents.map(a=>({...a,objective:'Z'.repeat(900)}))});
 assert.equal(c.turnTimeoutSec,180);assert.equal(c.rounds,8);assert.equal(c.roundTopics.length,8);
 assert.equal(c.roundTopics[0].length,240);assert.equal(c.agents[0].objective.length,420);
});
