import test from 'node:test';
import assert from 'node:assert/strict';
import { SpriteDirector } from '../app/ui/sprite-director.js';

function director() {
  globalThis.window = { matchMedia: () => ({ matches: false }) };
  const instance = new SpriteDirector({});
  instance.track = (person, name) => ['talking','confident','thinking','idle','objection'].includes(name) ? [{}] : [];
  return instance;
}

test('alterna somente entre alternativas disponíveis para o mesmo personagem e papel', () => {
  const sprites = director();
  assert.equal(sprites.selectAnimation('a','speaker','talking',['confident']), 'talking');
  sprites.recordAnimation('a','speaker','talking');
  assert.equal(sprites.selectAnimation('a','speaker','talking',['missing','confident']), 'confident');
  assert.equal(sprites.selectAnimation('b','speaker','talking',['confident']), 'talking');
  assert.equal(sprites.selectAnimation('a','listener','talking',['confident']), 'talking');
});

test('repete uma animação essencial quando não há alternativa coerente e limpa o histórico', () => {
  const sprites = director();
  sprites.recordAnimation('a','speaker','objection');
  assert.equal(sprites.selectAnimation('a','speaker','objection',[]), 'objection');
  sprites.recordAnimation('a','speaker','talking');
  sprites.resetVariety();
  assert.equal(sprites.selectAnimation('a','speaker','talking',['confident']), 'talking');
});
