import test from 'node:test';import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import { createServer } from '../server/index.js';
const listen = server => new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(`http://127.0.0.1:${server.address().port}`)));
const close=server=>new Promise(resolve=>server.close(resolve));
const advance=async(base,id,count=8)=>{for(let i=0;i<count;i++)await fetch(`${base}/api/debates/${id}/control`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'advance'})});};
const cfg = {topic:'A IA será positiva para criatividade?',agents:[{name:'Alpha',model:'a',position:'a favor',personality:'cientista'},{name:'Beta',model:'b',position:'contra',personality:'provocador'}],judgeModel:'j',rounds:1,exchanges:1,mode:'demo',allowRag:true};
test('HTTP: páginas, config, uploads RAG, busca, falta de chave, eventos do debate',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'arena-server-'));process.env.ARENA_DATA_PATH=path.join(dir,'memory.json');
 const server=createServer();const base=await listen(server);
 const post=(path,body)=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 try{
  const homepage=await fetch(base+'/');assert.equal(homepage.status,200);assert.match(await homepage.text(),/CONTRAPONTO/);
  const config=await (await fetch(base+'/api/config')).json();assert.equal(config.hasNimKey,false);assert.ok(config.models.length>0);
  const miss=await post('/api/debates',{...cfg,mode:'nim'});assert.equal(miss.status,400);assert.match((await miss.json()).error,/NVIDIA_API_KEY/);
  const file=await fetch(base+'/api/documents',{method:'POST',headers:{'x-filename':encodeURIComponent('pesquisa educação.txt')},body:'A criatividade e educação surgem da prática. '.repeat(9)});
  assert.equal(file.status,201);const {document}=await file.json();assert.equal(document.name,'pesquisa educação.txt');
  const {results}=await (await post('/api/search-memory',{query:'criatividade educação'})).json();assert.ok(results.length);
  const docs=await (await fetch(base+'/api/documents')).json();assert.equal(docs.documents.length,1);
  const created=await (await post('/api/debates',cfg)).json();assert.match(created.id,/^[0-9a-f-]{36}$/);
  await advance(base,created.id);
  const eventStream=await fetch(base+`/api/debates/${created.id}/events`);assert.equal(eventStream.status,200);
  const text=await eventStream.text();assert.match(text,/"type":"finished"/);assert.match(text,/"type":"judgment"/);
  const state=await (await fetch(base+`/api/debates/${created.id}`)).json();assert.equal(state.done,true);assert.equal(state.state.turns.length,2);
  assert.equal((await fetch(base+`/api/documents/${document.id}`,{method:'DELETE'})).status,200);
  assert.equal((await fetch(base+'/api/documents')).status,200);
 }finally{await close(server);delete process.env.ARENA_DATA_PATH;await rm(dir,{recursive:true,force:true});}
});
test('HTTP: roteiro singular disponível e formulário incoerente é rejeitado',async()=>{
 const server=createServer();const base=await listen(server);
 const post=(payload)=>fetch(base+'/api/debates',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
 try{
  const response=await fetch(base+'/api/scenarios/singular');assert.equal(response.status,200);
  const {preset}=await response.json();assert.equal(preset.mode,'singular');assert.equal(preset.rounds,5);
  assert.equal(preset.roundTopics.length,5);
  const bad=await post({...preset,topic:'Outra coisa totalmente diferente'});
  assert.equal(bad.status,400);assert.match((await bad.json()).error,/roteiro fixo/);
  const good=await post(preset);assert.equal(good.status,201);
  const {id}=await good.json();
  const snap=await (await fetch(base+`/api/debates/${id}`)).json();
  assert.ok(snap.events.some(e=>e.type==='started'));
  const cancelled=await fetch(base+`/api/debates/${id}/control`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'cancel'})});
  assert.equal(cancelled.status,200);
 }finally{await close(server);}
});
