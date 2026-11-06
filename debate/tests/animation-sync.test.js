import test from 'node:test';
import assert from 'node:assert/strict';
import { SpriteDirector } from '../app/ui/sprite-director.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function setup() {
  globalThis.window = { matchMedia: () => ({ matches: false }) };
  const director = new SpriteDirector({});
  director.track = () => [{ frame: '1', duration_ms: 70 }, { frame: '2', duration_ms: 70 }];
  director.url = frame => frame;
  return { director, image: { dataset: {}, parentElement: { classList: { add() {} } } } };
}

test('som acompanha o ciclo dos quadros e pausa junto com eles', async () => {
  const { director, image } = setup();
  let started = 0, stopped = 0, ended = 0;
  director.play('actor-a', 'lia', 'talking', image, {
    minFrameMs: 10,
    onStart: ({ duration }) => { started++; assert.equal(duration, 140); return () => { stopped++; }; },
    onEnd: () => { ended++; }
  });
  await wait(25);
  director.pause(true);
  const frame = image.dataset.frame;
  await wait(160);
  assert.equal(image.dataset.frame, frame);
  assert.equal(stopped, 0);
  assert.equal(ended, 0);
  director.pause(false);
  await wait(180);
  assert.equal(started, 1);
  assert.equal(stopped, 1);
  assert.equal(ended, 1);
});

test('interromper um movimento cancela o som e não dispara a próxima ação', async () => {
  const { director, image } = setup();
  let stopped = 0, ended = 0;
  director.play('actor-a', 'lia', 'talking', image, {
    minFrameMs: 10,
    onStart: () => () => { stopped++; },
    onEnd: () => { ended++; }
  });
  director.stopAll();
  await wait(170);
  assert.equal(stopped, 1);
  assert.equal(ended, 0);
});
