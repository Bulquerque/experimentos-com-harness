import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {performanceBeats} from '../app/ui/performance-director.js';

const root=path.resolve(import.meta.dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const actors=JSON.parse(read('app/assets/actors-v22/manifest.json'));

test('Lia e Dante têm oito quadros em cada estado que o diretor pode selecionar',()=>{
  const states=['idle','talking','thinking','confident','objection','surprised','frustrated','breakdown'];
  for(const who of ['lia','dante']) for(const state of states){
    const frames=actors.animations[`${who}/${state}`];
    assert.equal(frames.length,8,`${who}/${state}`);
    assert.ok(frames.every(frame=>frame.duration_ms>0),`${who}/${state}: duração`);
  }
  const sprite=read('app/ui/sprite-director.js');
  assert.match(sprite,/for \(const state of \['idle','talking','thinking','confident','objection','surprised','frustrated','breakdown'\]\)/);
  assert.match(sprite,/index\+\+;[\s\S]*if \(index >= frames.length\)/);
  assert.match(sprite,/breakdown\(side\)/);
});

test('Ouvinte começa a reagir durante a fala e volta a idle depois do ciclo inteiro',()=>{
  const sprite=read('app/ui/sprite-director.js');
  assert.match(sprite,/objection:'surprised',rebuttal:turn\.emotion==='frustrated'\?'frustrated':'thinking',question:'thinking',concession:'confident'/);
  assert.match(sprite,/this\.play\(`listener-react-\$\{other\}`,opponent,reaction,opponentImg,[\s\S]*?onEnd:finish/);
  for(const action of ['objection','rebuttal','question','concession']){
    const beat=performanceBeats({action,speaker:'a'}).beats.find(item=>item.phase==='listener');
    const expected={objection:2050,rebuttal:2550,question:2700,concession:2550}[action];
    assert.equal(beat.at,expected,`${action}: listener beat`);
  }
  assert.equal(performanceBeats({action:'argument'}).beats.find(item=>item.phase==='listener').at,2550);
});

test('Dante mantém espelhamento voltado ao centro no sprite RGBA ativo',()=>{
  const css=read('app/styles/actors-v22.css');
  assert.match(css,/\.duelist\.right \.portrait\.v22-portrait img\.pack-avatar\[data-motion-set="v22"\][\s\S]*?transform:scaleX\(-1\)!important/);
  const sprite=read('app/ui/sprite-director.js');
  assert.match(sprite,/img\.dataset\.motionSet = 'v22'/);
});

test('A câmera espera os estados v22 efetivamente usados antes de mudar para o ouvinte',()=>{
  const camera=read('app/ui/camera-director.js');
  const expected={objection:['objection',1080],rebuttal:['confident',1560],question:['thinking',1640],concession:['confident',1560]};
  for(const [action,[state,duration]] of Object.entries(expected)){
    assert.equal(actors.animations[`lia/${state}`].reduce((sum,frame)=>sum+frame.duration_ms,0),duration);
    assert.equal(actors.animations[`dante/${state}`].reduce((sum,frame)=>sum+frame.duration_ms,0),duration);
    assert.match(camera,new RegExp(`${action}:${duration}`));
  }
});
