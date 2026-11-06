import { createDebateEngine } from '../harness/harness.js';
import { validateConfig } from '../harness/config.js';

const config = validateConfig({
  topic: 'A inteligência artificial amplia a criatividade?',
  rounds: 1,
  exchanges: 1,
  wordLimit: 90,
  mode: 'demo',
  agents: [
    { name: 'Lia', position: 'a favor', personality: 'estrategista' },
    { name: 'Dante', position: 'contra', personality: 'provocador' }
  ]
});

const engine = createDebateEngine({ delayMs: 100 });
const result = await engine.runDebate(config, {
  emit(type, data) {
    if (type === 'turn') console.log(`\n${data.name}: ${data.speech}`);
    if (type === 'judgment') console.log(`\nJuiz: ${data.reason}`);
    if (type === 'finished') console.log('\nPrévia encerrada.');
    if (type === 'error') console.error(data.message);
  }
});

if (result.status !== 'finished') process.exitCode = 1;
