import { scriptedTurn } from './singular.js';
import { TOOL_DEFINITIONS, searchWeb, readSource } from './tools.js';
import { searchMemory } from './memory.js';
import { callNim } from './nim.js';
import { debaterMessages } from './prompts.js';
import { parseObject, normalizeTurn } from './response.js';

const DEMO_LINES = [
  ['Minha posição parte de um princípio: precisamos definir os termos do debate e explicar quais consequências devem ser consideradas.', 'confident', 'open-hand', 'argument'],
  ['Objeção! Uma conclusão convincente precisa mais que uma boa intenção. Quais fatos e critérios sustentam a sua interpretação?', 'frustrated', 'point', 'objection'],
  ['Você levantou uma dúvida importante. Vou distinguir o que é hipótese daquilo que podemos demonstrar com evidências.', 'thinking', 'arms-crossed', 'rebuttal'],
  ['Então faço uma pergunta direta: que informação poderia fazer você rever sua posição sobre este aspecto?', 'confident', 'point', 'question'],
  ['Concordo que precisamos considerar perspectivas diferentes e evitar generalizações. Isso não impede que eu sustente minha tese.', 'excited', 'open-hand', 'concession'],
  ['Nesse ponto há concordância parcial. Nossa diferença principal está na interpretação dos riscos e das consequências.', 'thinking', 'idle', 'concession']
];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const usageLimits = () => ({ search_web: 2, read_source: 2, search_memory: 2 });

/** Executa uma ferramenta pedida pelo LLM; o próprio modelo não executa código. */
async function executeTool(request, { limits, config, sourceMap, verified, emit, agent, webSearch, sourceRead, memorySearch, evidence }) {
  const name = request.function?.name;
  let args;
  try { args = JSON.parse(request.function?.arguments || '{}'); } catch { args = {}; }
  let result;
  if (!Object.hasOwn(limits, name)) result = { error: 'Ferramenta desconhecida.' };
  else if (limits[name] <= 0) result = { error: 'Limite da ferramenta por fala atingido.' };
  else if ((name === 'search_web' || name === 'read_source') && !config.allowWeb) result = { error: 'Pesquisa web desativada.' };
  else if (name === 'search_memory' && !config.allowRag) result = { error: 'Memória RAG desativada.' };
  else {
    limits[name]--;
    try {
      if (name === 'search_web') result = await webSearch(String(args.query || '').slice(0, 220), sourceMap);
      if (name === 'read_source') result = await sourceRead(String(args.source_id || ''), sourceMap);
      if (name === 'search_memory') result = await memorySearch(String(args.query || '').slice(0, 220), { limit: 4, scope: config.format === 'court' ? 'library' : config.allowPastDebates ? 'all' : 'library',
          documentIds: config.format === 'court' ? (evidence?.releasedIds || config.caseDocumentIds) : null });
      const sources = name === 'search_memory' && Array.isArray(result) ? result : name === 'read_source' && result?.text ? [result] : [];
      for (const item of sources) {
        if (!item.sourceId) continue;
        verified.set(item.sourceId, {
          sourceId: item.sourceId, title: String(item.document || item.title || 'Fonte').slice(0, 120),
          excerpt: String(item.text || '').slice(0, 900), ...(item.url ? { url: item.url } : {})
        });
      }
    } catch (error) { result = { error: String(error.message).slice(0, 200) }; }
  }
  emit('tool', { speaker: agent.id, tool: name, result: typeof result === 'object' ? result : { result } });
  return { role: 'tool', tool_call_id: request.id, name, content: JSON.stringify(result ?? {}) };
}

/** Um turno completo: prompt → NIM → ferramentas (até 3 ciclos) → fala visual. */
export function createTurnGenerator({ chat = callNim, webSearch = searchWeb, sourceRead = readSource,
  memorySearch = searchMemory, delayMs = 650, singularDelayMs = 3900 } = {}) {
  return async function generateTurn({ config, agent, turns, judgments, round, exchange, signal, evidence, emit = () => {} }) {
    if (config.mode === 'singular') {
      await sleep(singularDelayMs);
      return normalizeTurn(scriptedTurn(round, exchange, agent.id), agent, round, config.wordLimit);
    }
    if (config.mode === 'demo') {
      await sleep(delayMs);
      const courtDemo = [
        ['Esta é uma apresentação simulada: a acusação precisa explicar quais documentos sustentam sua alegação, sem presumir a culpa.', 'thinking','open-hand','argument'],
        ['Objeção! A defesa tem direito de contestar cada documento e apontar lacunas; não devemos inventar fatos ausentes dos autos.', 'frustrated','point','objection'],
        ['Concordo que os documentos devem ser examinados com cautela. Sem verificação externa, nenhuma conclusão é definitiva.', 'thinking','arms-crossed','concession'],
        ['O juiz deverá avaliar ao final o que foi demonstrado e registrar as dúvidas não resolvidas.', 'confident','open-hand','rebuttal']
      ];
      const [speech, emotion, gesture, action] = (config.format === 'court' ? courtDemo : DEMO_LINES)[turns.length % (config.format === 'court' ? courtDemo.length : DEMO_LINES.length)];
      return normalizeTurn({ speech, emotion, gesture, action }, agent, round, config.wordLimit);
    }

    const messages = debaterMessages({ config, agent, turns, judgments, round, exchange, evidence });
    const tools = TOOL_DEFINITIONS.filter(t => t.function.name === 'search_memory' ? config.allowRag : config.allowWeb);
    const limits = usageLimits();
    const sourceMap = new Map();
    const verified = new Map();

    for (let pass = 0; pass < 4; pass++) {
      if (signal?.aborted) throw new Error('Debate cancelado.');
      const deadline = AbortSignal.timeout(config.turnTimeoutSec * 1000);
      const turnSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
      const answer = await chat({ model: agent.model, messages, tools: pass < 3 ? tools : [], maxTokens: 1600, signal: turnSignal });
      if (!answer.tool_calls?.length) {
        const result = normalizeTurn(parseObject(answer.content) || answer.content, agent, round, config.wordLimit);
        // Somente IDs observados na resposta de uma ferramenta desta fala podem aparecer no placar.
        result.citations = result.citations.filter(id => verified.has(id));
        result.sources = result.citations.map(id => verified.get(id));
        return result;
      }
      messages.push({ role: 'assistant', content: answer.content ?? null,
        ...(answer.reasoning_content ? { reasoning_content: answer.reasoning_content } : {}), tool_calls: answer.tool_calls });
      for (const [index, request] of answer.tool_calls.entries()) {
        if (index >= 4) {
          messages.push({ role: 'tool', tool_call_id: request.id, name: request.function?.name, content: '{"error":"Máximo de 4 chamadas simultâneas."}' });
          continue;
        }
        messages.push(await executeTool(request, { limits, config, sourceMap, verified, emit, agent, webSearch, sourceRead, memorySearch, evidence }));
      }
    }
    return normalizeTurn('Não consegui concluir esta fala após o limite de ferramentas.', agent, round, config.wordLimit);
  };
}
