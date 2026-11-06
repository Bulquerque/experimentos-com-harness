import test from 'node:test';
import assert from 'node:assert/strict';
import { performanceBeats } from '../app/ui/performance-director.js';

test('atuação comum tem entradas e pausas previsíveis',()=>{
  const plan=performanceBeats({action:'argument',emotion:'confident'});
  assert.equal(plan.action,'argument');
  assert.deepEqual(plan.beats.map(x=>x.at),[0,520,2550,3360]);
});
test('relógio legado inicia a fala de objeção na fase de entrega',()=>{
  const plan=performanceBeats({action:'objection',emotion:'frustrated'});
  assert.equal(plan.beats[0].at,0);
  assert.equal(plan.beats[0].phase,'delivery');
});
test('valores desconhecidos não injetam ações visuais arbitrárias',()=>{
  const plan=performanceBeats({action:'<script>',emotion:'made-up'});
  assert.equal(plan.action,'argument');
  assert.equal(plan.emotion,'neutral');
});
