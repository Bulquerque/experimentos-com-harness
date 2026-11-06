import test from 'node:test';
import assert from 'node:assert/strict';
import {safePath,replaceUnique} from './files.ts';
test('bloqueia path traversal',()=>{assert.throws(()=>safePath('../fora.txt'));assert.throws(()=>safePath('../../.ssh/key'));});
test('bloqueia arquivos de segredos',()=>{assert.throws(()=>safePath('.env'));assert.throws(()=>safePath('sub/.env.local'));});
test('aceita arquivo do workspace',()=>assert.ok(safePath('src/index.ts').endsWith('src/index.ts')));
test('edita texto exato uma única vez',()=>assert.equal(replaceUnique('ABC DEF','ABC','XYZ'),'XYZ DEF'));
test('rejeita múltiplas ocorrências',()=>assert.throws(()=>replaceUnique('aa-aa','aa','xx')));
test('rejeita busca inexistente',()=>assert.throws(()=>replaceUnique('abc','def','q')));
