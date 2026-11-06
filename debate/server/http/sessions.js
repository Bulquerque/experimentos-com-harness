/** Sessões efêmeras. SSE transporta eventos, sem pedir nada ao modelo para desenhar a UI. */
export function createSessionStore(engine) {
  const sessions = new Map();

  function publish(session, type, data) {
    const event = { type, data, time: Date.now() };
    session.history.push(event);
    for (const client of session.clients) {
      try { client.write(`data: ${JSON.stringify(event)}\n\n`); }
      catch { session.clients.delete(client); }
    }
    if (['finished', 'error'].includes(type)) {
      for (const client of session.clients) client.end();
      session.clients.clear();
    }
  }

  function create(config) {
    const id = crypto.randomUUID();
    const session = {
      id, config, history: [], clients: new Set(), controller: new AbortController(),
      paused: false, done: false, state: null, evidence: null
    };
    session.advanceCredits = 0;
    session.advanceWaiters = [];
    session.controller.signal.addEventListener('abort', () => {
      for (const resolve of session.advanceWaiters.splice(0)) resolve();
    }, { once: true });
    sessions.set(id, session);
    // Limite simples para um protótipo local. Não é persistência multiusuário.
    while (sessions.size > 20) sessions.delete(sessions.keys().next().value);
    setImmediate(async () => {
      session.state = await engine.runDebate(config, {
        signal: session.controller.signal,
        emit: (type, data) => publish(session, type, data),
        registerEvidence: evidence => { session.evidence = evidence; },
        gate: async () => {
          while (session.paused && !session.controller.signal.aborted) {
            await new Promise(resolve => setTimeout(resolve, 150));
          }
        },
        stepGate: async () => {
          while (!session.controller.signal.aborted && session.advanceCredits < 1) {
            await new Promise(resolve => session.advanceWaiters.push(resolve));
          }
          if (session.controller.signal.aborted) throw new Error('Debate cancelado.');
          session.advanceCredits--;
        }
      });
      session.done = true;
    });
    return id;
  }

  function releaseEvidence(session, id) {
    if (!session || session.done || session.config.format !== 'court' || !session.evidence)
      throw new Error('Processo não está ativo para liberação de provas.');
    return session.evidence.release(id, { reason: 'manual' });
  }
  function advance(session) {
    if (!session || session.done)
      throw new Error('Avanço manual disponível apenas em um debate ativo.');
    session.advanceCredits = Math.min(20, session.advanceCredits + 1);
    if (session.advanceWaiters.length) session.advanceWaiters.shift()();
    return { advanced: true, queued: session.advanceCredits };
  }
  return { get: id => sessions.get(id), create, releaseEvidence, advance };
}
