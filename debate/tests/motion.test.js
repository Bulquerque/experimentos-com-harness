/** Critérios de direção visual. Não testa modelos: só contrato de UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');

test('O Face Card anima os olhos sem pular quadros',()=>{
  const sprite=read('app/ui/sprite-director.js');
  const app=read('app/app.js');
  const styles=read('app/styles/characters.css');
  assert.match(app,/overlay\.classList\.add\('visible','singular-action'\)/);
  assert.match(app,/sprites\.facecard\(side,cardAction,\$\('facecard-image'\)\)/);
  assert.match(styles,/animation:facecard-enter 1\.25s/);
  assert.match(sprite,/speed:Math\.max\(1,fullDuration\/460\),minFrameMs:40/);
  assert.match(sprite,/const fullDuration.*\.reduce/);
  assert.match(sprite,/this\.play\('facecard',person,track,img/);
});

test('O cenário oferece entrada reta ou diagonal e respeita movimento reduzido',()=>{
  const html=read('app/index.html'), css=read('app/styles/motion.css');
  assert.match(html,/id="cutin-path"/);
  assert.match(html,/styles\/motion\.css/);
  for(const name of ['card-straight-left','card-straight-right','card-diagonal-left','card-diagonal-right'])assert.match(css,new RegExp(name));
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/\.arena \.dialogue\{z-index:32\}/);
  assert.match(css,/data-shot-phase=performance/);
});

test('Manifesto possui gestos inteiros e a câmera espera seu fim',()=>{
  const cinema=read('app/ui/camera-director.js'),manifest=JSON.parse(read('app/assets/trio/manifest.json'));
  const expected={objection:['objection/corpo',1080],rebuttal:['argumento_forte/corpo',1440],question:['conversa_gestos/corpo',1835],concession:['negacao/corpo',1035]};
  for(const [action,[track,ms]] of Object.entries(expected)){
    assert.equal(manifest.animations[`lia/${track}`].reduce((a,f)=>a+f.duration_ms,0),ms,action);
    assert.equal(manifest.animations[`dante/${track}`].reduce((a,f)=>a+f.duration_ms,0),ms,action);
  }
  assert.match(cinema,/590\+poseMs\+160/);
  assert.match(cinema,/this\.stage\.dataset\.shotPhase='performance'/);
});
