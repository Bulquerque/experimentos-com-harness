/** V12: integridade do pacote com três personagens e a nova direção do juiz. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const dir=path.join(root,'app/assets/trio');
const manifest=JSON.parse(readFileSync(path.join(dir,'manifest.json'),'utf8'));
const read=file=>readFileSync(path.join(root,file),'utf8');

test('O novo manifesto tem três personagens e 37 sequências reais',()=>{
 assert.deepEqual(manifest.layout.map(p=>p.character_id),['lia','elias','dante']);
 assert.equal(Object.keys(manifest.animations).length,37);
 for(const [name,frames] of Object.entries(manifest.animations)) {
  assert.ok(frames.length>=2,name);
  for(const f of frames){
   assert.match(f.frame,/^personagens\/[a-zA-Z0-9_.\/]+\.png$/);
   assert.ok(!f.frame.includes('..'));
   assert.ok(f.duration_ms>=50 && f.duration_ms<=1500,name);
   assert.ok(statSync(path.join(dir,f.frame)).size>100,name);
  }
 }
});
test('Elias possui sprites de observação, pensamento, ordem, martelo e veredito',()=>{
 for(const [track,count] of [['idle',2],['observacao',3],['pensando',3],['ordem',4],['anuncio',3],['martelo',5],['veredito',4]]){
  assert.equal(manifest.animations['elias/'+track].length,count);
 }
 assert.equal(manifest.judge_assets.length,46);
 for(const x of manifest.judge_assets)assert.ok(statSync(path.join(dir,x.standard)).size>100,x.id);
});
test('O juiz é audiovisual: não adiciona modelo nem chamadas de ferramenta',()=>{
 const sprite=read('app/ui/sprite-director.js');
 const app=read('app/app.js');
 const html=read('app/index.html');
 const css=read('app/styles/judge.css');
 assert.match(sprite,/judgeAction\(action/);
 assert.match(sprite,/elias/);
 assert.match(app,/sprites\.judgeAction\('judgment'\)/);
 assert.match(app,/sprites\.judgeAction\('thinking'\)/);
 assert.match(html,/id="judge-stage-sprite"/);
 assert.match(html,/id="judge-sidebar-sprite"/);
 assert.match(css,/image-rendering:pixelated/);
 assert.doesNotMatch(sprite,/callNim|NVIDIA_API_KEY|search_web/);
});
