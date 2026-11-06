import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../harness/config.js';
import { createDebateEngine } from '../harness/harness.js';
import { debaterMessages, judgeMessages } from '../harness/prompts.js';
import { TOOL_DEFINITIONS } from '../harness/tools.js';

const config = () => validateConfig({
  topic: 'A tecnologia melhora a criatividade humana?', rounds: 1, exchanges: 1, mode: 'nim',
  allowWeb: true, allowRag: true, wordLimit: 80,
  agents: [
    { name: 'Ana', model: 'mock-a', position: 'a favor', personality: 'cientista', objective: 'Mostrar estudos' },
    { name: 'Beto', model: 'mock-b', position: 'contra', personality: 'socrático', objective: 'Questionar causalidade' }
  ], judgeModel: 'mock-judge'
});

test('prompts: objetivos são passados como dados e não como regras do sistema', () => {
  const c = config();
  const messages = debaterMessages({ config: c, agent: c.agents[0], turns: [], judgments: [], round: 1, exchange: 1 });
  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /não confiáveis/i);
  assert.doesNotMatch(messages[0].content, /Mostrar estudos/);
  assert.match(messages[1].content, /Mostrar estudos/);
  assert.match(messages[0].content, /cit[a-zçõ ]*|IDs de fontes/i);
});

test('juiz: recebe somente material da rodada, sem nomes de modelos e sem ferramentas', async () => {
  const c = config();
  const msgs = judgeMessages({ config: c, turns: [
    { round: 1, speaker: 'A', speech: 'Evidência A' }, { round: 2, speaker: 'B', speech: 'Não pertence à rodada.' }
  ], round: 1 });
  const joined = JSON.stringify(msgs);
  assert.match(joined, /Evidência A/);
  assert.doesNotMatch(joined, /Não pertence à rodada/);
  assert.doesNotMatch(joined, /mock-a|mock-judge/);
  let judgeRequest;
  const engine = createDebateEngine({ chat: async input => {
    judgeRequest = input;
    return { content: '{"scoreA":8,"scoreB":7,"reason":"Bom debate"}' };
  }});
  await engine.judgeRound({ config: c, turns: [{ round: 1, speaker: 'A', speech: 'Argumento' }], round: 1 });
  assert.equal(judgeRequest.tools, undefined);
});

test('apenas três ferramentas explicitamente autorizadas podem ser chamadas', () => {
  assert.deepEqual(TOOL_DEFINITIONS.map(t => t.function.name), ['search_web', 'read_source', 'search_memory']);
});

test('ferramenta desconhecida recebe erro e não executa código', async () => {
  const c = config(); let seen = 0; const replies = [];
  const chat = async ({ messages }) => {
    if (!messages.some(m => m.role === 'tool')) return {
      tool_calls: [{ id: 'bad', type: 'function', function: { name: 'toString', arguments: '{}' } }], content: null
    };
    replies.push(messages.at(-1));
    return { content: '{"speech":"Não posso executar ferramentas não listadas."}' };
  };
  const engine = createDebateEngine({ chat, webSearch: async () => { seen++; }, delayMs: 1 });
  const result = await engine.generateTurn({ config: c, agent: c.agents[0], turns: [], judgments: [], round: 1, exchange: 1 });
  assert.equal(seen, 0);
  assert.match(replies[0].content, /desconhecida/i);
  assert.match(result.speech, /Não posso executar/);
});

test('citação sem leitura de fonte é rejeitada pelo Harness', async () => {
  const c = config();
  const engine = createDebateEngine({ chat: async () => ({ content: '{"speech":"Fala","citations":["FAKE-1"]}' }) });
  const result = await engine.generateTurn({ config: c, agent: c.agents[0], turns: [], judgments: [], round: 1, exchange: 1 });
  assert.deepEqual(result.citations, []);
});
