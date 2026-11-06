import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const txt=p=>readFileSync(join(root,p),'utf8');
const scenario=JSON.parse(txt('offline/scenario.json'));
const manifest=JSON.parse(txt('app/assets/trio/manifest.json'));

test('HTML raiz abre com caminhos relativos, sem ES modules nem endpoints externos',()=>{
 const html=txt('index.html');
 assert.match(html,/<title>CONTRAPONTO/);
 assert.match(html,/offline\/app\.bundle\.js/);
 assert.doesNotMatch(html,/<script[^>]+type="module"/);
 assert.doesNotMatch(html,/(?:href|src)="\//);
 for(const match of html.matchAll(/(?:src|href)="(offline\/[^"?#]+|app\/assets\/[^"?#]+|app\/ui\/[^"?#]+)"/g)){
  assert.ok(existsSync(join(root,match[1])),`Recurso local ausente: ${match[1]}`);
 }
});

test('roteiro visual estendido: 5 rounds, 20 falas, juiz 5 vezes, ações e emoções variadas',()=>{
 assert.equal(scenario.preset.rounds,5);
 assert.equal(scenario.turns.length,20);
 assert.equal(scenario.judgments.length,5);
 assert.equal(new Set(scenario.preset.roundTopics).size,5);
 assert.deepEqual(new Set(scenario.turns.map(t=>t.speaker)),new Set(['A','B']));
 for(const round of [1,2,3,4,5]){
  assert.equal(scenario.turns.filter(t=>t.round===round).length,4);
  assert.ok(scenario.judgments.some(j=>j.round===round));
 }
 const actions=new Set(scenario.turns.map(t=>t.action));
 for(const a of ['argument','question','objection','rebuttal','concession'])assert.ok(actions.has(a),a);
 assert.ok(new Set(scenario.turns.map(t=>t.emotion)).size>=4);
 assert.ok(scenario.turns.every(t=>typeof t.speech==='string'&&t.speech.length>45));
 const totals=scenario.judgments.reduce((x,y)=>[x[0]+y.scoreA,x[1]+y.scoreB],[0,0]);
 assert.deepEqual(totals,[43,42]);
});

test('animações locais não dependem de NIM e manifesto cobre ações da prévia',()=>{
 const bundle=txt('offline/app.bundle.js');
 assert.ok(bundle.includes('window.CONTRAPONTO_MANIFEST'));
 assert.doesNotMatch(txt('offline/bridge.js'),/fetch\(/);
 assert.ok(existsSync(join(root,'app/assets/audio/objection-voice.mp3')));
 for(const side of ['lia','dante']){
  for(const track of ['conversa_loop/fala','conversa_loop/escuta','conversa_gestos/corpo','objection/corpo','objection/olhos','argumento_forte/corpo','negacao/corpo']){
   assert.ok(manifest.animations[`${side}/${track}`]?.length,`${side}/${track}`);
  }
 }
 for(const track of ['idle','observacao','pensando','martelo','veredito'])assert.ok(manifest.animations[`elias/${track}`]?.length,track);
});
