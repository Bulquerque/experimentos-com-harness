import test from 'node:test';
import assert from 'node:assert/strict';
import { debaterMessages } from '../harness/prompts.js';

test('o modelo recebe orientação para interpretar a personalidade e adaptar a emoção ao contexto', () => {
  const agent={id:'A',name:'Lia',position:'a favor',personality:'provocador',color:'#abc'};
  const config={agents:[agent,{id:'B',name:'Dante'}],roundTopics:[],topic:'Tema',rounds:2,exchanges:2,wordLimit:100};
  const [system]=debaterMessages({config,agent,turns:[],judgments:[],round:1,exchange:1});
  assert.match(system.content,/permaneça no personagem/i);
  assert.match(system.content,/frustração/i);
  assert.match(system.content,/repetir.*coerente/i);
});
