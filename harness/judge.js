import { scriptedJudgment } from './singular.js';
import { judgeMessages } from './prompts.js';
import { clampScore, parseObject } from './response.js';
import { callNim } from './nim.js';

/** O juiz não tem ferramentas, não debate e não sabe qual LLM está em cada lado. */
export function createJudge({ chat = callNim, delayMs = 650, singularDelayMs = 3900 } = {}) {
  return async function judgeRound({ config, turns, round, signal }) {
    if (config.mode === 'singular') {
      await new Promise(resolve => setTimeout(resolve, Math.min(singularDelayMs, 950)));
      return scriptedJudgment(round);
    }
    if (config.mode === 'demo') {
      await new Promise(resolve => setTimeout(resolve, Math.max(100, delayMs / 2)));
      const scoreA = Math.min(10, 7 + round % 2);
      const scoreB = Math.min(10, 8 - round % 2);
      return { round, scoreA, scoreB, winner: scoreA === scoreB ? 'empate' : scoreA > scoreB ? 'A' : 'B',
        reason: 'Notas simuladas para a demonstração. Nenhum juiz de IA foi consultado.',
        feedbackA: 'Avaliação ilustrativa.', feedbackB: 'Avaliação ilustrativa.', simulated: true };
    }
    const deadline = AbortSignal.timeout(config.turnTimeoutSec * 1000);
    const answer = await chat({
      model: config.judgeModel, messages: judgeMessages({ config, turns, round }),
      maxTokens: 1400, temperature: 0.2,
      signal: signal ? AbortSignal.any([signal, deadline]) : deadline
    });
    const value = parseObject(answer.content);
    if (!value || value.scoreA == null || value.scoreB == null) throw new Error('Juiz não retornou JSON de avaliação válido.');
    const scoreA = clampScore(value.scoreA), scoreB = clampScore(value.scoreB);
    return { round, scoreA, scoreB, winner: scoreA === scoreB ? 'empate' : scoreA > scoreB ? 'A' : 'B',
      reason: String(value.reason || '').slice(0, 600), feedbackA: String(value.feedbackA || '').slice(0, 400),
      feedbackB: String(value.feedbackB || '').slice(0, 400), simulated: false };
  };
}
