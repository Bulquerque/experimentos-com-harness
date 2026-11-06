/** Contraponto v13: invariantes de direção audiovisual e isolamento do Harness. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, statSync} from 'node:fs';
import {resolve,join} from 'node:path';
const ROOT=resolve(import.meta.dirname,'..');
const code=(name)=>readFileSync(join(ROOT,name),'utf8');
const m=JSON.parse(code('app/assets/trio/manifest.json'));

test('O juiz expõe camadas próprias em vez de tampar os sprites dos debatedores',()=>{
  const html=code('app/index.html'),js=code('app/ui/sprite-director.js'),css=code('app/styles/judge-effects.css');
  assert.match(html,/id="judge-impact-sprite"/);
  assert.match(html,/id="judge-eyes-sprite"/);
  assert.match(css,/pointer-events:none/);
  assert.match(css,/\[hidden\]/);
  for(const track of ['faixas_olhos','efeitos','martelo','veredito','observacao']){
    assert.ok(m.animations[`elias/${track}`]?.length >=2,track);
    assert.match(js,new RegExp(track));
  }
});

test('Laboratório expõe os 16 estados novos e mantém juiz Elias',()=>{
  assert.equal(Object.keys(m.animations).length,37);
  const html=code('app/index.html');
  assert.match(html,/<option value="elias">Elias · Juiz<\/option>/);
  const app=code('app/app.js');
  assert.match(app,/person\.value==='elias'\?sprites\.manifest\.animations:sprites\.actorAnimations/);
});

test('Gesto e face card têm intenção semântica adequada',()=>{
  const js=code('app/ui/sprite-director.js');
  assert.match(js,/concession:'confident'/);
  assert.match(js,/question:'thinking'/);
  assert.match(js,/this\.after\('judge-fx-start',650/);
});

test('O último veredito não pode ser cortado pela finalização do SSE',()=>{
  const app=code('app/app.js');
  assert.match(app,/stopSession\(\{preserveFinale:true\}\)/);
  assert.match(app,/function stopSession\(\{preserveFinale=false\}/);
  assert.match(app,/turn\.action==='objection'\?'order':'observe'/);
  const cinema=code('app/ui/camera-director.js');
  assert.match(cinema,/const hitMs=/);
  assert.match(cinema,/this\.audio\?\.cue\('judgment'\)/);
});

test('Arquivos de efeitos do juiz existem com pixels utilizáveis',()=>{
  for(const name of ['efeitos','faixas_olhos','props_martelo','props_maos','pulpito']){
    for(const {frame} of m.animations[`elias/${name}`]){
      assert.ok(statSync(join(ROOT,'app/assets/trio',frame)).size>1000,frame);
    }
  }
});
