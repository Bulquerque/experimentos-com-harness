import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app=readFileSync(new URL('../app/app.js',import.meta.url),'utf8');
const start=app.indexOf('function splitTurnIntoChunks(');
const end=app.indexOf('\nfunction speechDuration(',start);
assert.ok(start>=0&&end>start,'splitTurnIntoChunks must remain independently testable');
const sandbox={};
vm.runInNewContext(`${app.slice(start,end)}\nglobalThis.splitTurnIntoChunks=splitTurnIntoChunks;`,sandbox);
const split=sandbox.splitTurnIntoChunks;

test('equilibra blocos e evita uma palavra curta isolada no final',()=>{
 const speech='A primeira frase apresenta uma ideia importante. A segunda frase desenvolve o argumento com exemplos claros. A terceira conclui com uma proposta prática e objetiva.';
 const chunks=split(speech,75);
 assert.ok(chunks.length>1);
 assert.ok(chunks.every(chunk=>chunk.length<=75));
 assert.ok(Math.max(...chunks.map(chunk=>chunk.trim().length))-Math.min(...chunks.map(chunk=>chunk.trim().length))<=24);
 assert.ok(chunks.at(-1).trim().split(/\s+/).length>1);
});

test('mantém ordem, espaços normalizados e pontuação exatamente ao recompor',()=>{
 const input='  Olá,   mundo! Esta é a fala; com pausas,   citações “fiéis”.  ';
 const normalized=input.trim().replace(/\s+/g,' ');
 const chunks=split(input,18);
 assert.equal(chunks.join(''),normalized);
 assert.ok(chunks.every(chunk=>chunk.length<=18));
});

test('faz fallback para palavra muito longa sem perder caracteres ou exceder o limite',()=>{
 const input=`Antes ${'á'.repeat(47)} depois.`;
 const normalized=input.trim().replace(/\s+/g,' ');
 const chunks=split(input,12);
 assert.ok(chunks.length>4);
 assert.equal(chunks.join(''),normalized);
 assert.ok(chunks.every(chunk=>chunk.length<=12));
});

test('aumenta a quantidade de blocos em vez de cortar palavras comuns ou quebrar caracteres Unicode',()=>{
 const speech='abcde abcde abcde';
 const chunks=split(speech,10);
 assert.equal(chunks.join(''),speech);
 assert.ok(chunks.every(chunk=>chunk.length<=10));
 assert.deepEqual(Array.from(split('😀😀😀',2)),['😀','😀','😀']);
});

test('fala curta permanece em um único bloco e entrada vazia continua válida',()=>{
 assert.deepEqual(Array.from(split('Uma frase breve.',110)),['Uma frase breve.']);
 assert.deepEqual(Array.from(split('   ',110)),['']);
});
