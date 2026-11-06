/** Política de atuação: interpreta apenas o placar já atribuído pelo juiz.
 * Não julga a validade de argumentos, não usa texto do LLM e não inventa derrota.
 * Considera derrota grave ou sequência de derrotas com desvantagem acumulada.
 */
function rawBreakdown(judgments) {
  if (!Array.isArray(judgments) || !judgments.length) return null;
  const valid = judgments.every(j => j && Number.isInteger(j.round) && j.round >= 1 &&
    Number.isFinite(j.scoreA) && Number.isFinite(j.scoreB) &&
    j.scoreA >= 0 && j.scoreA <= 10 && j.scoreB >= 0 && j.scoreB <= 10);
  if (!valid) return null;
  const latest = judgments[judgments.length - 1];
  const delta = latest.scoreA - latest.scoreB;
  if (Math.abs(delta) < 0.0001) return null;
  const loser = delta < 0 ? 'a' : 'b';
  const loserScore = loser === 'a' ? latest.scoreA : latest.scoreB;
  const winnerScore = loser === 'a' ? latest.scoreB : latest.scoreA;
  const severe = winnerScore - loserScore >= 3 && loserScore <= 5;
  let streak = 0;
  for (let i = judgments.length - 1; i >= 0; i--) {
    const j = judgments[i];
    if ((loser === 'a' && j.scoreA < j.scoreB) || (loser === 'b' && j.scoreB < j.scoreA)) streak++;
    else break;
  }
  const totalA = judgments.reduce((s,j) => s+j.scoreA,0);
  const totalB = judgments.reduce((s,j) => s+j.scoreB,0);
  const cumulativeGap = loser === 'a' ? totalB - totalA : totalA - totalB;
  const sustained = streak >= 2 && cumulativeGap >= 4;
  if (!severe && !sustained) return null;
  return { side: loser, round: latest.round, reason: severe ? 'derrota_pontual_significativa' : 'derrotas_consecutivas',
    gap: Math.round(cumulativeGap * 100)/100, streak };
}

/** Cooldown: evita a mesma reação dramática a cada round perdido.
 * Um colapso pode ocorrer novamente após pelo menos duas rodadas completas.
 */
export function breakdownFromJudgments(judgments) {
  if (!Array.isArray(judgments)) return null;
  const lastBySide={a:-Infinity,b:-Infinity};
  let current=null;
  for(let i=1;i<=judgments.length;i++) {
    const raw=rawBreakdown(judgments.slice(0,i));
    if (!raw || i-lastBySide[raw.side] <= 2) continue;
    lastBySide[raw.side]=i;
    if(i===judgments.length)current=raw;
  }
  return current;
}

/** No Tribunal, a decisão final é um evento dramático distinto de pontuação.
 * Indeterminado e simulação sem IA nunca acionam o colapso automaticamente.
 */
export function breakdownFromCourtVerdict(verdict) {
  if (!verdict || verdict.simulated !== false) return null;
  if (verdict.decision === 'culpado') return {side:'b',reason:'decisao_final_adversa'};
  if (verdict.decision === 'nao_comprovado') return {side:'a',reason:'decisao_final_adversa'};
  return null;
}
