import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const data=JSON.parse(readFileSync(join(root,'app/assets/actors-v22/manifest.json'),'utf8'));
test('v23: animações transparentes completas e caminhos locais',()=>{
 const states=['idle','talking','thinking','confident','objection','surprised','frustrated','breakdown'];
 assert.equal(Object.keys(data.animations).length,16);
 for(const who of ['lia','dante']) for(const state of states){
  const frames=data.animations[`${who}/${state}`];assert.equal(frames.length,8);
  for(const f of frames){
   assert.match(f.frame,new RegExp(`^actors-v22/${who}/${state}/0[1-8]\\.png$`));
   const file=join(root,'app/assets',f.frame);assert.ok(statSync(file).size>1000,file);
  }
 }
 assert.ok(data.durations_ms.idle>data.durations_ms.talking);
});
test('v23: modo offline embute os quadros e preserva roteiro completo',()=>{
 const bundle=readFileSync(join(root,'offline/app.bundle.js'),'utf8');
 const manifest=readFileSync(join(root,'offline/manifest.js'),'utf8');
 assert.match(bundle,/actors-v22/);assert.match(bundle,/turn\(turn\)/);
 assert.match(manifest,/CONTRAPONTO_ACTOR_MANIFEST/);
 assert.match(readFileSync(join(root,'index.html'),'utf8'),/offline\/app\.bundle\.js/);
});
