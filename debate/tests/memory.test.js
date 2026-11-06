import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import { chunkText, ingestDocument, listDocuments, searchMemory, deleteDocument } from '../harness/memory.js';

test('RAG sem chave usa busca lexical para testes de componente, sem LLM local',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'arena-test-'));process.env.ARENA_DATA_PATH=path.join(dir,'memory.json');process.env.RAG_USE_EMBEDDINGS='false';
 try{
  assert.ok(chunkText('x'.repeat(3000)).length>1);
  const doc=await ingestDocument({name:'estudo.txt',text:'Uma pesquisa importante sobre educação, aprendizagem e IA no Brasil mostra impactos na criatividade. '.repeat(9)});
  assert.ok(doc.chunks>0);
  assert.equal((await listDocuments()).length,1);
  const results=await searchMemory('educação aprendizagem',{limit:3});assert.ok(results.length>0);assert.ok(results[0].sourceId.startsWith(doc.id));
  assert.equal(await deleteDocument(doc.id),true);assert.equal((await listDocuments()).length,0);
 } finally {delete process.env.ARENA_DATA_PATH;await rm(dir,{recursive:true,force:true});}
});
