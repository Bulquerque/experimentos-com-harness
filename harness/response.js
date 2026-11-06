import { ACTIONS, EMOTIONS, GESTURES } from './config.js';

/** Interpreta JSON puro ou cercado por um bloco ```json. */
export function parseObject(text) {
  if (typeof text !== 'string') return null;
  const stripped = text.replace(/^\s*```(?:json)?\s*|\s*```\s*$/gi, '').trim();
  try { return JSON.parse(stripped); } catch {}
  const first = stripped.indexOf('{'), last = stripped.lastIndexOf('}');
  try { return first >= 0 && last > first ? JSON.parse(stripped.slice(first, last + 1)) : null; }
  catch { return null; }
}

/** Normaliza a resposta da IA antes de enviá-la ao navegador. */
export function normalizeTurn(raw, agent, round, wordLimit) {
  const value = raw && typeof raw === 'object' ? raw : { speech: String(raw || '') };
  const speech = String(value.speech || 'Não consegui formular minha intervenção.')
    .replace(/<[^>]*>/g, '').trim().split(/\s+/).slice(0, wordLimit).join(' ');
  return {
    speaker: agent.id, name: agent.name, position: agent.position, round, speech,
    emotion: EMOTIONS.includes(value.emotion) ? value.emotion : 'neutral',
    gesture: GESTURES.includes(value.gesture) ? value.gesture : 'idle',
    action: ACTIONS.includes(value.action) ? value.action : 'argument',
    citations: Array.isArray(value.citations) ? value.citations.filter(x => typeof x === 'string').slice(0, 5) : []
  };
}

export function clampScore(value) {
  const score = Number(value);
  return Number.isFinite(score) ? Math.max(0, Math.min(10, score)) : 5;
}
