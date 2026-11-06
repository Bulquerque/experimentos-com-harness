import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT,sha,safePath,inspect,changeBatch,restore,replaceUnique} from './workspace.ts';

test('hash é consistente',()=>assert.equal(sha('abc').length,64));
test('protege segredos, caminhos absolutos e travessia',()=>{
 assert.throws(()=>safePath('../bad'));
 assert.throws(()=>safePath('/etc/passwd'));
 assert.throws(()=>safePath('.env.local'));
 assert.throws(()=>safePath('src/.npmrc'));
});
test('rejeita alteração ambígua e retorna candidato',()=>{
 assert.throws(()=>replaceUnique('foo foo','foo','bar'),/ambíguo/);
 assert.throws(()=>replaceUnique('alpha\nbeta','gamma','delta'),/não encontrado/);
});
test('edição transacional, dry_run, versionamento e restore',async()=>{
 await fs.mkdir(ROOT,{recursive:true});
 const rel=`_test-${process.pid}.txt`,abs=path.join(ROOT,rel);
 await fs.rm(abs,{force:true});
 try{
  const preview=await changeBatch([{op:'create',path:rel,content:'hello\n'}],true);
  assert.equal(preview.applied,false);
  await assert.rejects(fs.stat(abs));
  const created=await changeBatch([{op:'create',path:rel,content:'hello\n'}]);
  assert.equal(created.applied,true);
  const info=await inspect(rel);
  assert.equal(info.sha256,sha('hello\n'));
  await assert.rejects(changeBatch([{op:'replace',path:rel,old_text:'hello',new_text:'world',expected_hash:'0'.repeat(64)}]),/Conflito/);
  const changed=await changeBatch([{op:'replace',path:rel,old_text:'hello',new_text:'world',expected_hash:info.sha256}]);
  assert.equal((await fs.readFile(abs,'utf8')),'world\n');
  await restore('undo',changed.revision_id);
  assert.equal((await fs.readFile(abs,'utf8')),'hello\n');
  await restore('undo',created.revision_id);
  await assert.rejects(fs.stat(abs));
 }finally{await fs.rm(abs,{force:true});}
});
