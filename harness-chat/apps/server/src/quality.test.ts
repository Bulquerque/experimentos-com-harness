process.env.RUNNER_TOKEN = process.env.RUNNER_TOKEN || 'runner-test-token-123456';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {leanPolicyIssues,leanCodeOnly} from './lean-policy.ts';
import {changeBatch,safePath} from './workspace.ts';
import {verifyChecks} from './runner.ts';

test('Lean: bloqueia prova admitida e axiomas locais, mas ignora palavras em comentários ou strings',()=>{
 for(const source of [
  'theorem bad : True := by sorry',
  'theorem bad : True := by admit',
  'axiom impossible : False',
  'constant impossible : False',
  'opaque impossible : False := by sorry',
  'theorem bad : True := by exact sorryAx True false',
  'example : True := by native_decide'
 ])assert.ok(leanPolicyIssues(source).length>0,source);
 assert.deepEqual(leanPolicyIssues('-- sorry\n/- outer /- admit -/ axiom -/\n#check "sorry"\ntheorem good (p: Prop) : p -> p := by intro h; exact h'),[]);
 assert.match(leanCodeOnly('/- hi /- nested -/ -/ theorem valid : True := by trivial'),/theorem valid/);
});

test('Transform recusa entradas malformadas e caminhos Windows ambíguos',async()=>{
 assert.throws(()=>safePath('..\\outside.txt'));
 await assert.rejects(changeBatch([{op:'create',path:'x-should-not-exist.txt'}]),/conteúdo textual/);
 await assert.rejects(changeBatch([{op:'create',path:'x-should-not-exist.txt',content:'ok',expected_hash:'bad'}]),/SHA-256/);
});

test('Auto-verificação detecta testes Python em tests/ e falha diante de logs truncados',async()=>{
 const s=http.createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk.toString();
  const request=JSON.parse(raw);
  res.setHeader('content-type','application/json');
  res.end(JSON.stringify({exit_code:0,output:request.command.includes('unittest')?'Ran 6 tests in 0.003s\nOK':'',runtime:request.runtime,duration_ms:2,truncated:request.command.includes('compileall'),timed_out:false}));
 });
 s.listen(0,'127.0.0.1');await once(s,'listening');
 const address=s.address();assert.ok(address&&typeof address!=='string');
 const oldUrl=process.env.RUNNER_URL,oldSock=process.env.RUNNER_SOCKET;
 delete process.env.RUNNER_SOCKET;process.env.RUNNER_URL=`http://127.0.0.1:${address.port}`;
 try{
  const result=await verifyChecks(undefined,new AbortController().signal);
  assert.ok(result.checks.some(c=>c.name==='python_tests'),'detecção em tests/test_*.py');
  assert.ok(result.checks.some(c=>c.name==='python_compile'));
  assert.equal(result.passed,false,'resultado truncado não comprova sucesso');
 }finally{
  if(oldUrl===undefined)delete process.env.RUNNER_URL;else process.env.RUNNER_URL=oldUrl;
  if(oldSock===undefined)delete process.env.RUNNER_SOCKET;else process.env.RUNNER_SOCKET=oldSock;
  await new Promise<void>(resolve=>s.close(()=>resolve()));
 }
});


test('NVIDIA connection probe: no key is rejected; real HTTP mock responds with timing',async()=>{
 const model=http.createServer(async(req,res)=>{
  assert.equal(req.url,'/v1/chat/completions');
  assert.equal(req.headers.authorization,'Bearer mock-nvidia-secret');
  let raw='';for await(const part of req)raw+=String(part);
  assert.equal(JSON.parse(raw).messages[0].content,'Responda exatamente: OK');
  res.writeHead(200,{'content-type':'application/json'});
  res.end(JSON.stringify({choices:[{message:{content:'OK'}}],usage:{prompt_tokens:8,completion_tokens:2}}));
 });
 model.listen(0,'127.0.0.1');await once(model,'listening');
 const a=model.address();assert.ok(a&&typeof a!=='string');
 const backend=http.createServer();backend.listen(0,'127.0.0.1');await once(backend,'listening');
 const b=backend.address();assert.ok(b&&typeof b!=='string');
 await new Promise<void>(resolve=>backend.close(()=>resolve()));
 const {spawn}=await import('node:child_process');
 const child=spawn(process.execPath,['--disable-warning=ExperimentalWarning','--experimental-strip-types','src/index.ts'],{
  cwd:new URL('../',import.meta.url).pathname,
  env:{...process.env,HOST:'127.0.0.1',PORT:String(b.port),NVIDIA_BASE_URL:`http://127.0.0.1:${a.port}/v1`,NVIDIA_API_KEY:''},
  stdio:['ignore','pipe','pipe']
 });
 try{
  let ok=false;
  for(let i=0;i<60;i++){
   try{const response=await fetch(`http://127.0.0.1:${b.port}/api/health`);if(response.ok){ok=true;break;}}catch{}
   await new Promise(r=>setTimeout(r,30));
  }
  assert.equal(ok,true,'Backend did not start for probe test');
  const endpoint=`http://127.0.0.1:${b.port}/api/nvidia/probe`;
  const send=(data:unknown)=>fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
  const missing=await send({model:'nvidia/model'});assert.equal(missing.status,400);
  const result=await send({model:'nvidia/model',key:'mock-nvidia-secret'});
  assert.equal(result.status,200);const payload=await result.json();assert.equal(payload.ok,true);
  assert.equal(payload.reply,'OK');assert.equal(payload.usage.completion_tokens,2);
  assert.match(payload.scope,/não chamadas de ferramenta/);
 }finally{child.kill('SIGTERM');await once(child,'exit').catch(()=>{});await new Promise<void>(resolve=>model.close(()=>resolve()));}
});
