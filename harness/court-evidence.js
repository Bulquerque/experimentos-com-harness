/**
 * Dossiê progressivo de um tribunal fictício.
 * Uma prova anexada NÃO está automaticamente disponível aos agentes: entra
 * em cena quando a sessão planejada começa ou o usuário a libera antes.
 * Não se pode inserir IDs que não pertencem ao caso após a abertura.
 */
export function createCourtEvidence(config, emit = () => {}) {
  const allowed = new Set(config.caseDocumentIds || []);
  const released = new Set();
  const history = [];
  const schedule = new Map((config.caseEvidencePlan || []).map(p => [p.documentId, p.releaseRound]));
  let currentRound = 0;

  function release(documentId, { reason = 'manual', round = currentRound } = {}) {
    if (!allowed.has(documentId)) throw new Error('Documento não pertence aos autos deste processo.');
    if (released.has(documentId)) return false;
    released.add(documentId);
    const record = { documentId, round, reason, sequence: history.length + 1 };
    history.push(record);
    emit('evidence_released', { ...record, releasedIds: [...released] });
    return true;
  }
  function beginRound(round) {
    currentRound = round;
    for (const id of allowed) if ((schedule.get(id) || 1) <= round) release(id, { reason: 'agendada', round });
  }
  return {
    beginRound, release,
    get releasedIds() { return [...released]; },
    get history() { return history.map(x => ({ ...x })); },
    get currentRound() { return currentRound; }
  };
}
