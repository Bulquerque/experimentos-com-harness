import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {createServer} from '../server/index.js';
import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const listen = server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(`http://127.0.0.1:${server.address().port}`)));
const close=server=>new Promise(resolve=>server.close(resolve));
const read=async req=>{const chunks=[];for await(const b of req)chunks.push(b);return Buffer.concat(chunks).toString();};
const advance=async(base,id,count=8)=>{for(let i=0;i<count;i++)await fetch(`${base}/api/debates/${id}/control`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'advance'})});};
test('integração NIM SIMULADO: requisições HTTP, ferramenta RAG, juiz, SSE e memória',async()=>{
 const original={key:process.env.NVIDIA_API_KEY,base:process.env.NIM_BASE_URL,data:process.env.ARENA_DATA_PATH,emb:process.env.RAG_USE_EMBEDDINGS};
 const dir=await mkdtemp(path.join(os.tmpdir(),'arena-mock-nim-'));
 let toolRequests=0,judgments=0,toolResults=0;
 const upstream=http.createServer(async(req,res)=>{
  const body=JSON.parse(await read(req));assert.equal(req.headers.authorization,'Bearer FAKE-KEY-TEST-ONLY');
  let message;
  if(body.model==='mock-judge'){
   judgments++;message={role:'assistant',content:JSON.stringify({scoreA:9,scoreB:8,reason:'A apresentou argumento verificável.',feedbackA:'Bom',feedbackB:'Precisa responder'})};
  } else if(body.model==='mock-a'&&!body.messages.some(m=>m.role==='tool')){
   toolRequests++;assert.ok(body.tools?.length);message={role:'assistant',content:null,tool_calls:[{id:'t1',type:'function',function:{name:'search_memory',arguments:'{"query":"criatividade tecnologia"}'}}]};
  }else{
   const referenced=body.messages.some(m=>m.role==='tool');if(referenced)toolResults++;
   message={role:'assistant',content:JSON.stringify({speech:'A criatividade pode melhorar com ferramentas.',emotion:'confident',gesture:'point',action:'argument',citations:[]})};
  }
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({choices:[{message}]}));
 });
 const upstreamBase=await listen(upstream);
 process.env.NVIDIA_API_KEY='FAKE-KEY-TEST-ONLY';process.env.NIM_BASE_URL=upstreamBase+'/v1';process.env.ARENA_DATA_PATH=path.join(dir,'memory.json');process.env.RAG_USE_EMBEDDINGS='false';
 const app=createServer(),base=await listen(app);
 try{
  const upload=await fetch(base+'/api/documents',{method:'POST',headers:{'x-filename':'artigo.txt'},body:'A criatividade tecnologia educação cultura é melhor quando há ferramentas para pensar. '.repeat(11)});
  assert.equal(upload.status,201);
  const config={topic:'A inteligência artificial ajuda a criatividade?',agents:[{name:'Alex',model:'mock-a',position:'a favor',personality:'cientista'},{name:'Nova',model:'mock-b',position:'contra',personality:'provocador'}],judgeModel:'mock-judge',rounds:1,exchanges:1,mode:'nim',allowRag:true,allowWeb:false};
  const created=await (await fetch(base+'/api/debates',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(config)})).json();
  assert.ok(created.id);
  await advance(base,created.id);
  const events=await (await fetch(base+`/api/debates/${created.id}/events`)).text();
  assert.match(events,/"type":"finished"/);assert.match(events,/"type":"tool"/);assert.match(events,/"type":"judgment"/);
  const session=await (await fetch(base+`/api/debates/${created.id}`)).json();
  assert.equal(session.state.status,'finished');assert.equal(session.state.outcome.winner,'A');
  assert.equal(toolRequests,1);assert.equal(judgments,1);assert.equal(toolResults,1);
  const docs=await (await fetch(base+'/api/documents')).json();assert.equal(docs.documents.length,2); // arquivo + debate passado
 }finally{
  await close(app);await close(upstream);await rm(dir,{recursive:true,force:true});
  for(const [key,env] of Object.entries({key:'NVIDIA_API_KEY',base:'NIM_BASE_URL',data:'ARENA_DATA_PATH',emb:'RAG_USE_EMBEDDINGS'})){
   if(original[key]===undefined)delete process.env[env];else process.env[env]=original[key];
  }
 }
});
