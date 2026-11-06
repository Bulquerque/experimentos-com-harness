/**
 * CONTRAPONTO / Harness mínimo
 *
 * O Harness não pesquisa a web, não renderiza sprites e não avalia argumentos.
 * Ele organiza a sequência: turnos A/B → juiz → próximo round → resultado.
 * As responsabilidades concretas ficam nos arquivos agent-turn, judge e nim.
 */
import { callNim } from './nim.js';
import { searchWeb, readSource } from './tools.js';
import { searchMemory, saveDebateMemory } from './memory.js';
import { validateConfig } from './config.js';
import { createTurnGenerator } from './agent-turn.js';
import { createJudge } from './judge.js';
import { judgeCase } from './court.js';
import { createCourtEvidence } from './court-evidence.js';
// Política pura compartilhada com a apresentação. Não modifica as notas do juiz.
import { breakdownFromJudgments } from '../app/ui/breakdown-policy.js';
export { normalizeTurn, parseObject } from './response.js';

function abortableDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Debate cancelado.'));
    let timer;
    const cleanup = () => signal?.removeEventListener('abort', abort);
    const abort = () => { clearTimeout(timer); cleanup(); reject(new Error('Debate cancelado.')); };
    timer = setTimeout(() => { cleanup(); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

function waitForPresentation(turn, signal, { voiceRate = 0 } = {}) {
  const words=String(turn.speech||'').trim().split(/\s+/).filter(Boolean).length;
  const duration=voiceRate ? Math.min(7800,Math.max(1300,words/voiceRate*1000+200)) : Math.min(7200,Math.max(2500,1400+words*55));
  return abortableDelay(duration, signal);
}

export function createDebateEngine({ chat = callNim, webSearch = searchWeb, sourceRead = readSource,
  memorySearch = searchMemory, memorySave = saveDebateMemory, caseJudge = judgeCase, delayMs = 650, singularDelayMs = 1300 } = {}) {
  const generateTurn = createTurnGenerator({ chat, webSearch, sourceRead, memorySearch, delayMs, singularDelayMs });
  const judgeRound = createJudge({ chat, delayMs, singularDelayMs });

  async function runDebate(input, { emit = () => {}, signal, gate = async () => {}, stepGate = async () => {}, registerEvidence = () => {} } = {}) {
    const config = validateConfig(input); // Um único contrato para UI, testes e NIM.
    const state = { config, turns: [], judgments: [], outcome: null, status: 'running' };
    const evidence = config.format === 'court' ? createCourtEvidence(config, emit) : null;
    if (evidence) registerEvidence(evidence); // O servidor oferece a liberação manual validada.
    emit('started', { config });

    try {
      for (let round = 1; round <= config.rounds; round++) {
        emit('round_start', { round, total: config.rounds, subtopic: config.roundTopics[round - 1] || config.topic,
          courtSession: config.format === 'court' });
        if (evidence) evidence.beginRound(round);

        for (let exchange = 1; exchange <= config.exchanges; exchange++) {
          // Inverter quem abre rounds pares evita vantagem fixa de resposta.
          const order = round % 2 ? config.agents : [...config.agents].reverse();
          for (const agent of order) {
            await gate(); // Permite pausar sem travar o navegador.
            if (state.turns.length) await stepGate();
            if (signal?.aborted) throw new Error('Debate cancelado.');
            emit('thinking', { speaker: agent.id, round });
            const turn = await generateTurn({ config, agent, turns: state.turns, judgments: state.judgments,
              round, exchange, evidence, signal, emit });
            state.turns.push(turn);
            emit('turn', turn); // A interface escolhe câmera, sprite e áudio.
            // Mantém a fala na tela durante a atuação para que o próximo evento
            // "thinking" não corte som, gesto e reação do turno recém-exibido.
            await waitForPresentation(turn, signal);
          }
        }

        if (config.format === 'court') continue; // Juiz decide uma única vez, após todas as fases.
        await stepGate();
        emit('judging', { round });
        const judgment = await judgeRound({ config, turns: state.turns, round, signal });
        state.judgments.push(judgment);
        emit('judgment', judgment);
        if (round === config.rounds && config.mode !== 'singular') await stepGate();
        if (config.mode === 'singular') await waitForPresentation({ speech: judgment.reason }, signal, { voiceRate: 2.15 });
        // Preserva tempo mínimo para o gesto de colapso antes do próximo round;
        // sem isso o SSE emitiria round_start e thinking imediatamente,
        // cortando a animação antes de o personagem agarrar o cabelo.
        if (round < config.rounds && breakdownFromJudgments(state.judgments)) {
          await abortableDelay(2150, signal);
        }
      }

      if (config.format === 'court') {
        await stepGate();
        emit('judging', { round: config.rounds, final: true });
        const verdict = config.mode !== 'nim'
          ? { decision: 'nao_comprovado', reason: 'SIMULAÇÃO: documentos não foram avaliados por uma IA. A ausência de provas analisadas impede um resultado conclusivo.',
              findings: [], missingEvidence: ['Não houve análise de um juiz de IA.'], citations: [], standardAssessment: 'Roteiro de apresentação, sem julgamento.', simulated: true }
          : await caseJudge({ config, turns: state.turns, evidence, signal, chat });
        state.outcome = { verdict, decision: verdict.decision, format: 'court', evidenceTimeline: evidence.history };
        emit('case_verdict', verdict);
        state.status = 'finished';
        emit('finished', state.outcome);
        return state;
      }
      const totalA = state.judgments.reduce((sum, x) => sum + x.scoreA, 0);
      const totalB = state.judgments.reduce((sum, x) => sum + x.scoreB, 0);
      state.outcome = { totalA, totalB, winner: totalA === totalB ? 'empate' : totalA > totalB ? 'A' : 'B' };
      // A simulação não é gravada como memória factual.
      if (config.mode === 'nim') {
        try { await memorySave(state); }
        catch (error) { emit('warning', { message: `Histórico não salvo: ${error.message}` }); }
      }
      state.status = 'finished';
      emit('finished', state.outcome);
    } catch (error) {
      state.status = signal?.aborted ? 'cancelled' : 'error';
      emit('error', { message: error.message, cancelled: !!signal?.aborted });
    }
    return state;
  }

  // Mantém a mesma API pública, usada pelo servidor e pelos testes existentes.
  return { runDebate, generateTurn, judgeRound };
}
