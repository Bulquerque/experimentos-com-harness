/* Contrato único de entrada: protege o loop contra valores fora dos limites. */
import { SINGULAR_PRESET } from './singular.js';
export const MODELS = [
  { id: 'nvidia/nemotron-3.5-bolt-e4b', label: 'Nemotron 3.5 Bolt E4B · padrão verificado' },
  { id: 'nvidia/nemotron-3.5-lightning-30b-a3b', label: 'Nemotron 3.5 Lightning · alternativo' },
  { id: 'nvidia/nemotron-3.5-super-vl-120b-a12b', label: 'Nemotron 3.5 Super VL · juiz' },
  { id: 'z-ai/glm-5.3-flash', label: 'GLM 5.3 Flash · alternativo' },
  { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B' }
];
export const PERSONAS = ['estrategista', 'provocador', 'cientista', 'socrático', 'diplomata'];
export const EMOTIONS = ['neutral', 'confident', 'thinking', 'surprised', 'frustrated', 'excited'];
export const GESTURES = ['idle', 'point', 'open-hand', 'arms-crossed', 'slam-desk'];
export const ACTIONS = ['argument', 'rebuttal', 'question', 'objection', 'concession'];
export const MAX_DOC_BYTES = 3 * 1024 * 1024;
export const MAX_DOC_TEXT = 150000;
export function bounded(n, min, max, fallback) {
  const x = Number(n); return Number.isFinite(x) ? Math.max(min, Math.min(max, Math.trunc(x))) : fallback;
}
/** Chamado no endpoint HTTP e novamente no início do Harness. */
export function validateConfig(input = {}) {
  const competitors = Array.isArray(input.agents) ? input.agents : [];
  if (competitors.length !== 2) throw new Error('O debate exige exatamente dois debatedores.');
  const topic = String(input.topic || '').trim().slice(0, 300);
  if (topic.length < 8) throw new Error('Informe um tema com pelo menos 8 caracteres.');
  const agents = competitors.map((a, i) => ({
    id: i === 0 ? 'A' : 'B',
    name: String(a?.name || `Debatedor ${i + 1}`).trim().slice(0, 36),
    model: String(a?.model || MODELS[0].id).slice(0, 150),
    position: String(a?.position || (i ? 'contra' : 'a favor')).trim().slice(0, 90),
    viewpoint: String(a?.viewpoint || '').trim().slice(0, 180),
    role: String(a?.role || '').trim().slice(0, 180),
    objective: String(a?.objective || '').trim().slice(0, 420),
    instructions: String(a?.instructions || '').trim().slice(0, 550),
    personality: PERSONAS.includes(a?.personality) ? a.personality : PERSONAS[i],
    color: /^#[0-9a-fA-F]{6}$/.test(a?.color || '') ? a.color : (i ? '#ff716c' : '#59c8e8')
  }));
  const court = input.format === 'court';
  const ids = [...new Set((Array.isArray(input.caseDocumentIds) ? input.caseDocumentIds : []).filter(id => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 80);
  const rounds = bounded(input.rounds, 1, 8, 3);
  const requestedPlan = Array.isArray(input.caseEvidencePlan) ? input.caseEvidencePlan : [];
  // Apenas documentos do próprio caso, com sessão de entrada limitada ao total.
  const courtPlan = ids.map(documentId => {
    const match = requestedPlan.find(x => x?.documentId === documentId);
    return { documentId, releaseRound: bounded(match?.releaseRound, 1, rounds, 1) };
  });
  const config = {
    topic, agents,
    format: court ? 'court' : 'debate',
    caseTitle: String(input.caseTitle || topic).trim().slice(0, 180),
    allegation: String(input.allegation || '').trim().slice(0, 1600),
    jurisdiction: String(input.jurisdiction || 'Jurisdição fictícia — simulação didática').trim().slice(0, 180),
    proofStandard: ['alem_duvida_razoavel','preponderancia'].includes(input.proofStandard) ? input.proofStandard : 'alem_duvida_razoavel',
    caseDocumentIds: ids, caseEvidencePlan: court ? courtPlan : [],
    judgeModel: String(input.judgeModel || MODELS[0].id).slice(0, 150),
    rounds,
    roundTopics: Array.from({ length: bounded(input.rounds, 1, 8, 3) }, (_, i) => String(Array.isArray(input.roundTopics) ? (input.roundTopics[i] || '') : '').trim().slice(0, 240)),
    turnTimeoutSec: bounded(input.turnTimeoutSec, 15, 180, 60),
    exchanges: bounded(input.exchanges, 1, 4, 2),
    wordLimit: bounded(input.wordLimit, 35, 250, 100),
    allowWeb: !!input.allowWeb,
    allowRag: input.allowRag !== false,
    allowPastDebates: !!input.allowPastDebates,
    mode: input.mode === 'nim' ? 'nim' : input.mode === 'singular' ? 'singular' : 'demo'
  };
  if (court && config.mode === 'singular') throw new Error('Roteiro Singular de ideias é separado do Tribunal Simulado.');
  if (config.mode === 'singular') {
    const preset = SINGULAR_PRESET;
    const fixed = config.topic === preset.topic && config.rounds === preset.rounds &&
      config.exchanges === preset.exchanges &&
      JSON.stringify(config.roundTopics) === JSON.stringify(preset.roundTopics) &&
      agents.every((agent, i) => ['name', 'position', 'viewpoint', 'role', 'objective', 'instructions'].every(key =>
        agent[key] === preset.agents[i][key]));
    if (!fixed) throw new Error('O Debate Singular tem roteiro fixo. Use o botão DEBATE SINGULAR para carregar o exemplo.');
  }
  return config;
}
