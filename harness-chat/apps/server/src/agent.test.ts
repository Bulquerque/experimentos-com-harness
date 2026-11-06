process.env.RUNNER_TOKEN = process.env.RUNNER_TOKEN || 'runner-test-token-123456';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tools} from './tools.ts';
import {ROOT} from './workspace.ts';
import {newRun,executeRun,sanitizeModelContent} from './agent.ts';

function server(handler:(req:any,res:any)=>void){
 return new Promise<{url:string;close:()=>Promise<void>}>(resolve=>{
  const instance=http.createServer(handler);
  instance.listen(0,'127.0.0.1',()=>{
   const address=instance.address();if(typeof address!=='object'||!address)throw Error('Address unavailable');
   resolve({url:`http://127.0.0.1:${address.port}`,close:()=>new Promise<void>((resolveClose,reject)=>instance.close(e=>e?reject(e):resolveClose()))});
  });
 });
}
function mockMessage(message:unknown){return JSON.stringify({choices:[{message}],usage:{prompt_tokens:100,completion_tokens:30}});}

test('exatamente seis ferramentas, contratos únicos e funções de engenharia',()=>{
 assert.deepEqual(tools.map(t=>t.name),['orient','inspect','transform','execute','verify','preview']);
 assert.equal(new Set(tools.map(t=>t.name)).size,6);
 for(const tool of tools)assert.equal(tool.parameters.type,'object');
});

test('loop do agente: orient → transform → preview → verify → checagens aprovadas',async()=>{
 await fs.mkdir(ROOT,{recursive:true});
 const name=`_agent-test-${process.pid}-${Date.now()}.html`;
 const planned=[
  {name:'orient',arguments:JSON.stringify({})},
  {name:'transform',arguments:JSON.stringify({actions:[{op:'create',path:name,content:'<!doctype html><html><body><title>Verified Preview</title></body></html>'}]})},
  {name:'preview',arguments:JSON.stringify({entry:name})},
  {name:'verify',arguments:JSON.stringify({checks:['web_assets','web_script_syntax']})},
 ];
 let requests=0;
 const model=await server((_req,res)=>{
  const item=planned[requests++];
  res.setHeader('content-type','application/json');
  if(item){res.end(mockMessage({role:'assistant',content:null,tool_calls:[{id:`call${requests}`,type:'function',function:item}]}));return;}
  res.end(mockMessage({role:'assistant',content:'Arquivo criado, preview disponível, testes selecionados aprovados.'}));
 });
 const runner=await server((_req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({runtime:'python',exit_code:0,duration_ms:13,output:'Ran 3 tests in 0.001s\nOK',truncated:false,timed_out:false}));});
 const prevUrl=process.env.RUNNER_URL;const prevToken=process.env.RUNNER_TOKEN;
 process.env.RUNNER_URL=runner.url;process.env.RUNNER_TOKEN='runner-test-token-123456';
 try{
  const run=newRun('Crie uma página HTML e teste o algoritmo','model/mock');
  await executeRun(run,'test-key',model.url+'/v1');
  assert.equal(requests,5);
  assert.equal(run.status,'checks_passed',run.answer);
  assert.equal(run.calls,4);
  assert.equal(run.usage.prompt,500);
  assert.ok(run.events.some(e=>e.tool==='preview'&&e.detail.includes('/preview/')));
  assert.ok(run.events.some(e=>e.type==='verification'&&e.ok===true));
 }finally{
  if(prevUrl===undefined)delete process.env.RUNNER_URL;else process.env.RUNNER_URL=prevUrl;
  if(prevToken===undefined)delete process.env.RUNNER_TOKEN;else process.env.RUNNER_TOKEN=prevToken;
  await model.close();await runner.close();await fs.rm(path.join(ROOT,name),{force:true});
 }
});

test('resposta sem verificação permanece não verificada',async()=>{
 const model=await server((_req,res)=>{res.setHeader('content-type','application/json');res.end(mockMessage({role:'assistant',content:'Terminei sem testar.'}));});
 try{const run=newRun('Resolva um problema','model/mock');await executeRun(run,'test-key',model.url+'/v1');assert.equal(run.status,'unverified');assert.equal(run.verification,'unavailable');}
 finally{await model.close();}
});

test('saneamento remove blocos e canais internos, inclusive blocos sem fechamento',()=>{
 assert.equal(sanitizeModelContent('<think>raciocínio privado</think>Resposta visível'), 'Resposta visível');
 assert.equal(sanitizeModelContent('<analysis>segredo sem fechamento'), '');
 assert.equal(sanitizeModelContent('<|channel>analysis\nsegredo\n<|channel>final\nResposta final'), 'Resposta final');
 assert.equal(sanitizeModelContent('<|begin_of_thought|>segredo<|end_of_thought|>Texto'), 'Texto');
 assert.equal(sanitizeModelContent([{type:'reasoning',text:'segredo'},{type:'text',text:'Texto seguro'}]), 'Texto seguro');
});

test('saneamento preserva marcadores literais dentro de código Markdown',()=>{
 const fenced='Exemplo:\n```text\n<think>texto literal</think>\n<|channel>analysis\nlinha literal\n```\nResposta.';
 assert.equal(sanitizeModelContent(fenced),fenced);
 assert.equal(sanitizeModelContent('Literal: `<think>código</think>` e `<|channel>analysis`.'),'Literal: `<think>código</think>` e `<|channel>analysis`.');
});

test('histórico legado de respostas do assistente é saneado antes de reenviar ao modelo',async()=>{
 let sentMessages:any[]=[];
 const model=await server((req,res)=>{
  let raw='';req.on('data',(chunk:any)=>raw+=chunk);
  req.on('end',()=>{sentMessages=JSON.parse(raw).messages;res.setHeader('content-type','application/json');res.end(mockMessage({role:'assistant',content:'Resposta nova.'}));});
 });
 try{
  const history=[
   {role:'user' as const,content:'Pergunta anterior'},
   {role:'assistant' as const,content:'<think>segredo antigo</think>Resposta antiga visível'},
   {role:'assistant' as const,content:'<analysis>somente segredo antigo'}
  ];
  const run=newRun('Continue a conversa','test/model',history);
  await executeRun(run,'test-key',model.url+'/v1');
  const assistantHistory=sentMessages.filter((message:any)=>message.role==='assistant');
  assert.deepEqual(assistantHistory.map((message:any)=>message.content),['Resposta antiga visível']);
  assert.doesNotMatch(JSON.stringify(sentMessages),/segredo antigo/);
 }finally{await model.close();}
});

test('bloco privado aberto fora de código continua oculto através de código e até seu fechamento real',()=>{
 const input='Visível antes. <think>privado\n```text\n</think> não é fechamento dentro do código\n```\nainda privado</think> Visível depois.';
 assert.equal(sanitizeModelContent(input),'Visível antes.  Visível depois.');
 assert.equal(sanitizeModelContent('Visível <think>privado\n```text\nsem fechamento externo\n```'),'Visível');
});

test('conteúdo interno não entra no histórico da API, na resposta ou nos eventos',async()=>{
 let requests=0;let secondMessages:any[]=[];
 const model=await server((req,res)=>{
  requests++;
  if(requests===2){let raw='';req.on('data',(chunk:any)=>raw+=chunk);req.on('end',()=>{secondMessages=JSON.parse(raw).messages;res.setHeader('content-type','application/json');res.end(mockMessage({role:'assistant',content:'Resposta final limpa.'}));});return;}
  res.setHeader('content-type','application/json');
  res.end(mockMessage({role:'assistant',content:'<think>raciocínio secreto</think>Vou consultar o workspace.',reasoning_content:'outro pensamento secreto',analysis:'mais pensamento',tool_calls:[{id:'safe-call',type:'function',function:{name:'orient',arguments:'{}'},reasoning:'campo inesperado'}]}));
 });
 try{
  const run=newRun('Inspecione o workspace','test/model');await executeRun(run,'test-key',model.url+'/v1');
  assert.equal(requests,2);assert.equal(run.answer,'Resposta final limpa.');
  assert.equal(secondMessages.find((m:any)=>m.role==='assistant')?.content,'Vou consultar o workspace.');
  const serialized=JSON.stringify({messages:secondMessages,answer:run.answer,events:run.events});
  assert.doesNotMatch(serialized,/raciocínio secreto|outro pensamento secreto|mais pensamento/);
 }finally{await model.close();}
});

test('resposta composta apenas por pensamento falha sem expor o pensamento',async()=>{
 const model=await server((_req,res)=>{res.setHeader('content-type','application/json');res.end(mockMessage({role:'assistant',content:'<think>raciocínio secreto</think>',reasoning_content:'também secreto'}));});
 try{const run=newRun('Converse','test/model');await executeRun(run,'test-key',model.url+'/v1');
  assert.equal(run.status,'failed');assert.match(run.answer,/não retornou uma resposta visível/);
  assert.doesNotMatch(run.answer,/secreto/);assert.ok(run.events.every(e=>!e.detail.includes('secreto')));
 }finally{await model.close();}
});


test('HTML criado + somente python_tests aprovado permanece não verificado',async()=>{
 const name=`_evidence-${process.pid}-${Date.now()}.html`;
 const calls=[
  {name:'transform',arguments:JSON.stringify({actions:[{op:'create',path:name,content:'<html><body>Hello</body></html>'}]})},
  {name:'verify',arguments:JSON.stringify({checks:['python_tests']})}
 ];
 let i=0;
 const model=await server((_req,res)=>{
  res.setHeader('content-type','application/json');
  const c=calls[i++];res.end(c?mockMessage({role:'assistant',content:null,tool_calls:[{id:`c${i}`,type:'function',function:c}]}):mockMessage({role:'assistant',content:'Concluído'}));
 });
 const runner=await server((_req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({runtime:'python',exit_code:0,duration_ms:1,output:'Ran 3 tests in 0.001s\nOK',truncated:false,timed_out:false}));});
 const old=process.env.RUNNER_URL;process.env.RUNNER_URL=runner.url;
 try{const run=newRun('Crie HTML e teste','test/model');await executeRun(run,'test-key',model.url+'/v1');
  assert.equal(run.status,'unverified');assert.deepEqual(run.evidence?.missing_checks,['web_assets','web_script_syntax']);}
 finally{if(old===undefined)delete process.env.RUNNER_URL;else process.env.RUNNER_URL=old;await model.close();await runner.close();await fs.rm(path.join(ROOT,name),{force:true});}
});

test('API NVIDIA responde 429 e agente tenta novamente, sem inventar conclusão',async()=>{
 let attempts=0;
 const model=await server((_req,res)=>{
  attempts++;
  res.setHeader('content-type','application/json');
  if(attempts===1){res.statusCode=429;res.end(JSON.stringify({message:'Rate limit'}));return;}
  res.end(mockMessage({role:'assistant',content:'Resposta obtida após retry, não verificada.'}));
 });
 try{const run=newRun('Explique uma função','test/model');await executeRun(run,'test-key',model.url+'/v1');
  assert.equal(attempts,2);assert.equal(run.status,'unverified');assert.match(run.answer,/após retry/);
  assert.ok(run.events.some(e=>e.title.includes('NVIDIA HTTP 429')));
 }finally{await model.close();}
});

test('testes preexistentes não comprovam tarefa quando modelo não altera nenhum arquivo',async()=>{
 let requests=0;
 const model=await server((_req,res)=>{
  res.setHeader('content-type','application/json');
  res.end(mockMessage(requests++===0?{role:'assistant',content:null,tool_calls:[{id:'verify-old',type:'function',function:{name:'verify',arguments:JSON.stringify({checks:['web_assets','web_script_syntax']})}}]}:{role:'assistant',content:'Implementei tudo.'}));
 });
 try{const run=newRun('Crie um dashboard novo e funcional','test/model');await executeRun(run,'test-key',model.url+'/v1');
  assert.equal(run.status,'unverified');assert.notEqual(run.verification,'passed');
  assert.ok(run.evidence?.changed_files.length===0);
 }finally{await model.close();}
});
