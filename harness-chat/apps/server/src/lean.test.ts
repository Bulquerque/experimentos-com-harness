import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {tools} from './tools.ts';
import {verifyChecks} from './runner.ts';

async function listener(handle:(req:http.IncomingMessage,res:http.ServerResponse)=>void){
 const server=http.createServer(handle);
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const a=server.address();if(!a||typeof a==='string')throw new Error('address missing');
 return {server,url:`http://127.0.0.1:${a.port}`,close:()=>new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()))};
}

test('Lean é integrado às seis ferramentas existentes',()=>{
 assert.equal(tools.length,6);
 assert.ok(JSON.stringify(tools.find(t=>t.name==='verify')).includes('lean_core'));
 assert.ok(JSON.stringify(tools.find(t=>t.name==='verify')).includes('mathlib_build'));
 assert.ok(JSON.stringify(tools.find(t=>t.name==='execute')).includes('lean'));
});

test('verify lean_core passa instruções e modo somente leitura ao executor',async()=>{
 let received:any;
 const runner=await listener(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk.toString();received=JSON.parse(raw);
  res.writeHead(200,{'content-type':'application/json'});
  res.end(JSON.stringify({exit_code:0,runtime:'lean',duration_ms:9,output:'',timed_out:false,truncated:false}));
 });
 const before=process.env.RUNNER_URL;const token=process.env.RUNNER_TOKEN;
 process.env.RUNNER_URL=runner.url;process.env.RUNNER_TOKEN='runner-test-token-123456';
 try{
  const result=await verifyChecks(['lean_core'],new AbortController().signal);
  assert.equal(result.passed,true);
  assert.equal(result.checked,1);
  assert.equal(received.runtime,'lean');
  assert.equal(received.readonly,true);
  assert.match(received.command,/sorry/);
  assert.match(received.command,/lean/);
 }finally{
  if(before===undefined)delete process.env.RUNNER_URL;else process.env.RUNNER_URL=before;
  if(token===undefined)delete process.env.RUNNER_TOKEN;else process.env.RUNNER_TOKEN=token;
  await runner.close();
 }
});

test('HTTP Lean Lab: exemplo, rejeição de prova incompleta, verificação isolada e arquivos',async()=>{
 const runnerCalls:any[]=[];
 const runner=await listener(async(req,res)=>{
  if(req.url==='/health'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true}));return;}
  let raw='';for await(const chunk of req)raw+=chunk.toString();runnerCalls.push(JSON.parse(raw));
  res.writeHead(200,{'content-type':'application/json'});
  res.end(JSON.stringify({exit_code:0,runtime:'lean',duration_ms:17,output:'Lean mock: compilação simulada no teste',timed_out:false,truncated:false}));
 });
 const portListener=await listener((_req,res)=>res.end('reserved'));
 const port=Number(new URL(portListener.url).port);await portListener.close();
 const child=spawn(process.execPath,['--disable-warning=ExperimentalWarning','--experimental-strip-types','src/index.ts'],{
  cwd:new URL('../',import.meta.url).pathname,
  env:{...process.env,HOST:'127.0.0.1',PORT:String(port),RUNNER_URL:runner.url,RUNNER_TOKEN:'runner-test-token-123456',NVIDIA_API_KEY:''},
  stdio:['ignore','pipe','pipe']
 });
 const base=`http://127.0.0.1:${port}`;
 let started=false;
 try{
  for(let i=0;i<100;i++){
   if(child.exitCode!==null)throw Error('Server exited before ready');
   try{const r=await fetch(base+'/api/health');if(r.ok){started=true;break;}}catch{await new Promise(resolve=>setTimeout(resolve,30));}
  }
  assert.equal(started,true,'Backend did not start');
  const page=await fetch(base+'/');assert.equal(page.status,200);assert.match(await page.text(),/id="files-button"/);
  const example=await (await fetch(base+'/api/lean/example')).json();
  assert.match(example.source,/theorem/);
  const files=await (await fetch(base+'/api/files')).json();
  assert.ok(files.files.includes('proofs/Examples.lean'));
  const bad=await fetch(base+'/api/lean/check',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({source:'theorem incomplete : True := by sorry'})});
  const refusal=await bad.json();assert.equal(refusal.passed,false);assert.match(refusal.reason,/sorry/);
  assert.equal(runnerCalls.length,0,'An admitted proof must not reach the runner');
  const axiom=await fetch(base+'/api/lean/check',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({source:'axiom impossible : False\ntheorem anything : False := impossible'})});
  const axiomResult=await axiom.json();assert.equal(axiomResult.passed,false);assert.match(axiomResult.reason,/axiom/);
  assert.equal(runnerCalls.length,0,'Axiom declarations must not reach the runner');
  const good=await fetch(base+'/api/lean/check',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({source:example.source})});
  const ok=await good.json();assert.equal(ok.passed,true);assert.equal(runnerCalls.length,1);
  assert.equal(runnerCalls[0].runtime,'lean');assert.equal(runnerCalls[0].readonly,true);
  const verify=await fetch(base+'/api/lean/verify',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  assert.equal((await verify.json()).passed,true);
  assert.equal(runnerCalls.length,2);
  const blocked=await fetch(base+'/api/file?path=../.env');assert.equal(blocked.status,400);
  const noKey=await fetch(base+'/api/runs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({task:'test'})});
  assert.equal(noKey.status,400);
 }finally{
  child.kill('SIGTERM');await once(child,'exit').catch(()=>{});await runner.close();
 }
});
