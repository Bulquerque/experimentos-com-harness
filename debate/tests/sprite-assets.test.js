/** Verifica a biblioteca efetivamente usada: nenhuma cópia de master ou sprite sem referência. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const assets = path.join(root, 'app/assets/trio');
const manifest = JSON.parse(fs.readFileSync(path.join(assets, 'manifest.json'), 'utf8'));
test('37 sequências; todos os quadros e retratos válidos', () => {
  assert.equal(Object.keys(manifest.animations).length, 37);
  let count=0;
  for (const [key, frames] of Object.entries(manifest.animations)) {
    assert.ok(frames.length >= 1, key);
    for (const {frame,duration_ms} of frames) {
      assert.match(frame, /^personagens\/[a-z0-9_\/.-]+\.png$/i);
      assert.ok(!frame.includes('..'));
      assert.ok(duration_ms >= 40 && duration_ms <= 1500, frame);
      assert.ok(fs.statSync(path.join(assets,frame)).size > 200, frame);
      count++;
    }
  }
  assert.ok(count >= 220);
});
test('Biblioteca final não carrega frames órfãos nem pacotes legados', () => {
  const frames = new Set(Object.values(manifest.animations).flat().map(x=>x.frame));
  for (const item of manifest.layout) frames.add(item.primary_sprite);
  const walk = dir => fs.readdirSync(dir,{withFileTypes:true}).flatMap(d=>d.isDirectory()?walk(path.join(dir,d.name)):[path.join(dir,d.name)]);
  const actual = walk(path.join(assets,'personagens')).map(p=>path.relative(assets,p).replaceAll(path.sep,'/'));
  assert.deepEqual(new Set(actual),frames);
  assert.ok(!fs.existsSync(path.join(root,'app/assets/master')));
  assert.ok(fs.existsSync(path.join(root,'app/catalog.html')));
});
test('Frontend anima sem tocar em código de inferência NVIDIA', () => {
  const app=fs.readFileSync(path.join(root,'app/app.js'),'utf8');
  const sprite=fs.readFileSync(path.join(root,'app/ui/sprite-director.js'),'utf8');
  assert.match(app,/sprites\.turn\(turn\)/);
  assert.match(sprite,/this\.actorAnimations/);
  assert.doesNotMatch(sprite,/NVIDIA_API_KEY|\bcallNim\b/);
});
