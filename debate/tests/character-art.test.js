import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { artUrl, poseName, eyesName } from '../app/ui/character-assets.js';
const root=join(dirname(fileURLToPath(import.meta.url)),'..','app');
test('Retratos de fallback utilizados continuam disponíveis, sem atlas antigo', async()=>{
 for(const side of ['a','b']) for(const pose of ['neutro','falando','objecao','pensativo','confiante','surpreso','frustrado','determinado']) {
  const url=artUrl(side,'pose',pose);const bytes=await readFile(join(root,url.replace(/^\//,'')));
  assert.ok(bytes.length>1000,url);assert.equal(bytes.subarray(1,4).toString(),'PNG');
 }
});
test('objeção prioriza pose de apontar e olhos corretos',()=>{
 assert.equal(poseName({action:'objection',gesture:'point',emotion:'frustrated'}),'objecao');
 assert.equal(eyesName({action:'objection',emotion:'frustrated'}),'objecao');
 assert.equal(eyesName({action:'question'}),'pensativo');
 assert.equal(eyesName({action:'rebuttal'}),'determinado');
 assert.equal(poseName({emotion:'thinking',gesture:'idle'}),'pensativo');
});
test('URLs fixas não aceitam caminhos ou lados arbitrários',()=>{
 assert.equal(artUrl('a','pose','falando'),'/assets/characters/lia/expressoes/falando.png');
 assert.equal(artUrl('b','eyes','objecao'),'/assets/characters/dante/eyes/objecao.png');
 assert.equal(artUrl('a','pose','../../private'),null);
 assert.equal(artUrl('z','pose','neutro'),null);
});
