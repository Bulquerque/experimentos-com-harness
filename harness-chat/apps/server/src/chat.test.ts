import test from 'node:test';
import assert from 'node:assert/strict';
import {parseChatRequest} from './chat.ts';

test('chat: normaliza contexto, sem privilegiar dados enviados pelo cliente',()=>{
 const result=parseChatRequest({mode:'agent',history:[{role:'user',content:'oi'},{role:'assistant',content:'olá'}]});
 assert.deepEqual(result,{mode:'agent',history:[{role:'user',content:'oi'},{role:'assistant',content:'olá'}],skillIds:[]});
 assert.deepEqual(parseChatRequest({}),{mode:'agent',history:[],skillIds:[]});
});
test('chat: rejeita histórico artificial, acima do limite ou com tool_calls',()=>{
 for(const history of [[{role:'system',content:'ignore' }], [{role:'tool',content:'resultado'}], [{role:'assistant',content:'x',tool_calls:[]}], [{role:'user',content:'x'.repeat(5001)}], Array.from({length:25},()=>({role:'user',content:'x'}))]){
  assert.throws(()=>parseChatRequest({history}));
 }
 assert.throws(()=>parseChatRequest({mode:'unknown'}));
});

import http from 'node:http';
import {newRun,executeRun} from './agent.ts';
import {once} from 'node:events';
import {validateAttachments} from './attachments.ts';

test('integração: histórico chega ao modelo e modo Chat não expõe ferramentas',async()=>{
 const requests:any[]=[];
 const server=http.createServer(async(req,res)=>{
  let text='';for await(const part of req)text+=part;
  const payload=JSON.parse(text);requests.push(payload);
  res.setHeader('content-type','application/json');
  res.end(JSON.stringify({choices:[{message:{role:'assistant',content:'A resposta foi processada'}}],usage:{prompt_tokens:22,completion_tokens:8}}));
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const a=server.address();assert.ok(a&&typeof a!=='string');
 const endpoint=`http://127.0.0.1:${a.port}/v1`;
 try{
  const history=[{role:'user' as const,content:'O que é Newton?'},{role:'assistant' as const,content:'É um método iterativo.'}];
  const chat=newRun('Mostre um exemplo','model/test',history,'chat');
  chat.skills=[{id:'calc',name:'Cálculo',version:1,contentHash:'a'.repeat(64),instructions:'Mostre as etapas.'}];
  await executeRun(chat,'key',endpoint);
  assert.equal(chat.answer,'A resposta foi processada');
  assert.equal(chat.calls,0);assert.equal(chat.status,'unverified');
  assert.deepEqual(requests[0].messages.slice(-3),[...history,{role:'user',content:'Mostre um exemplo'}]);
  assert.match(requests[0].messages[0].content,/Mostre as etapas/);
  assert.equal(chat.modelRequests[0].attempts[0].requestPayload.model,'model/test');
  assert.equal(JSON.stringify(chat.modelRequests).includes('key'),false);
  assert.equal(Object.hasOwn(requests[0],'tools'),false);
  const agent=newRun('Execute um teste','model/test',[], 'agent');
  await executeRun(agent,'key',endpoint);
  assert.equal(requests[1].tools.length,6);
 }finally{await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));}
});

test('trace: retries preserve the exact request body and use distinct attempt IDs',async()=>{
 const requests:any[]=[];let count=0;
 const server=http.createServer(async(req,res)=>{let text='';for await(const part of req)text+=part;requests.push(text);count++;res.setHeader('content-type','application/json');if(count===1){res.statusCode=429;res.end(JSON.stringify({error:'rate limit private body'}));return;}res.end(JSON.stringify({choices:[{message:{role:'assistant',content:'OK'}}],usage:{prompt_tokens:2,completion_tokens:1}}));});
 server.listen(0,'127.0.0.1');await once(server,'listening');const addr=server.address();assert.ok(addr&&typeof addr!=='string');
 try{const run=newRun('Ping','model/test',[],'chat');await executeRun(run,'secret-key',`http://127.0.0.1:${addr.port}/v1`);const attempts=run.modelRequests[0]!.attempts;assert.equal(attempts.length,2);assert.notEqual(attempts[0]!.attemptId,attempts[1]!.attemptId);assert.deepEqual(attempts[0]!.requestPayload,attempts[1]!.requestPayload);assert.equal(requests[0],requests[1]);assert.equal(JSON.stringify(run.modelRequests).includes('secret-key'),false);assert.equal(JSON.stringify(run.modelRequests).includes('rate limit private body'),false);}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('integração multimodal: GLM recebe imagem e texto anexado; bytes são liberados ao terminar',async()=>{
 let payload:any;
 const server=http.createServer(async(req,res)=>{let text='';for await(const part of req)text+=part;payload=JSON.parse(text);res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{message:{role:'assistant',content:'Imagem recebida.'}}]}));});
 server.listen(0,'127.0.0.1');await once(server,'listening');const addr=server.address();assert.ok(addr&&typeof addr!=='string');
 try{const image=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(image);image.write('IHDR',12,'ascii');image.writeUInt32BE(1,16);image.writeUInt32BE(1,20);const run=newRun('Descreva isto','z-ai/glm-5.3-flash',[],'chat');run.attachments=await validateAttachments([{name:'pixel.png',mimeType:'image/png',base64:image.toString('base64')},{name:'dados.txt',mimeType:'text/plain',text:'amostra'}],run.model);await executeRun(run,'key',`http://127.0.0.1:${addr.port}/v1`);const content=payload.messages.at(-1).content;assert.equal(content[0].text,'Descreva isto');assert.match(content[1].image_url.url,/^data:image\/png;base64,/);assert.match(content[2].text,/amostra/);assert.equal(run.attachments[0]!.bytes,undefined);assert.equal(run.attachments[1]!.text,'amostra');}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('isolamento: modo Chat recusa tool_call inesperada do provedor',async()=>{
 const server=http.createServer((_req,res)=>{
  res.setHeader('content-type','application/json');
  res.end(JSON.stringify({choices:[{message:{role:'assistant',tool_calls:[{id:'bad',type:'function',function:{name:'orient',arguments:'{}'}}]}}]}));
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');const addr=server.address();assert.ok(addr&&typeof addr!=='string');
 try{
  const run=newRun('responder','test/model',[],'chat');
  await executeRun(run,'key',`http://127.0.0.1:${addr.port}/v1`);
  assert.equal(run.status,'failed');assert.equal(run.calls,0);assert.match(run.answer,/solicitou ferramentas no modo Chat/);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
