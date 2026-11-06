import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from './workspace.ts';

async function server(handler:(r:http.IncomingMessage,s:http.ServerResponse)=>void){
 const instance=http.createServer(handler);instance.listen(0,'127.0.0.1');await once(instance,'listening');
 const address=instance.address();assert.ok(address&&typeof address!=='string');
 return {url:`http://127.0.0.1:${address.port}`,close:()=>new Promise<void>(resolve=>instance.close(()=>resolve()))};
}
async function freePort(){const temp=await server((_r,s)=>s.end('ok'));const port=Number(new URL(temp.url).port);await temp.close();return port;}

test('rotas de ambiente verificam runtimes reais simulados e distinguem Lean Core/Mathlib',async()=>{
 const seen:string[]=[];
 const runner=await server(async(req,res)=>{
  if(req.url==='/health'){res.end(JSON.stringify({ok:true}));return;}
  let body='';for await(const chunk of req)body+=String(chunk);
  const input=JSON.parse(body);seen.push(input.command);
  assert.equal(input.readonly,true);
  res.end(JSON.stringify({exit_code:0,runtime:input.runtime,duration_ms:4,output:'mock: não é execução real',truncated:false,timed_out:false}));
 });
 const port=await freePort();const url=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['--disable-warning=ExperimentalWarning','--experimental-strip-types','src/index.ts'],{
  cwd:new URL('../',import.meta.url).pathname,
  env:{...process.env,HOST:'127.0.0.1',PORT:String(port),RUNNER_URL:runner.url,RUNNER_TOKEN:'runner-test-token-123456',RUNNER_SOCKET:'',NVIDIA_API_KEY:''},
  stdio:['ignore','pipe','pipe']
 });
 const post=(route:string,obj:unknown={})=>fetch(url+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(obj)});
 try{
  let ready=false;
  for(let i=0;i<70;i++){try{const r=await fetch(url+'/api/health');if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,30));}
  assert.equal(ready,true,'Backend não iniciou');
  const summary=await (await fetch(url+'/api/doctor')).json();assert.equal(summary.app.ok,true);assert.equal(summary.runner.available,true);
  const checked=await (await post('/api/doctor/check')).json();assert.equal(checked.ok,true);assert.deepEqual(checked.checks.map((x:any)=>x.name),['node','python','lean']);
  const before=seen.length;
  const core=await post('/api/lean/check',{source:'import Mathlib\nexample : True := by trivial',mode:'core'});
  assert.equal(core.status,400);assert.equal(seen.length,before);
  const invalid=await post('/api/lean/check',{source:'theorem t : True := by trivial',mode:'unknown'});
  assert.equal(invalid.status,400);
  const correct=await post('/api/lean/check',{source:'import Mathlib\ntheorem t : True := by trivial',mode:'mathlib'});
  assert.equal(correct.status,200);assert.equal((await correct.json()).passed,true);
  assert.match(seen.at(-1)||'',/lake env lean/);
  assert.match(seen.at(-1)||'',/\/workspace\/proofs\/mathlib\//);
  assert.equal(seen.length,before+1);
  // CSS link attributes may occur in any order; preview should inline local assets.
  const stamp=`_preview-check-${process.pid}-${Date.now()}`;
  await fs.writeFile(path.join(ROOT,stamp+'.html'),`<html><body><link href="${stamp}.css?v=1" rel="stylesheet"><h1>Preview check</h1></body></html>`);
  await fs.writeFile(path.join(ROOT,stamp+'.css'),'body { color: rgb(10, 20, 30); }');
  try{
   const preview=await fetch(url+'/preview/'+stamp+'.html');
   assert.equal(preview.status,200);
   assert.match(await preview.text(),/rgb\(10, 20, 30\)/);
   assert.match(preview.headers.get('content-security-policy')||'',/sandbox allow-scripts/);
  }finally{
   await fs.rm(path.join(ROOT,stamp+'.html'),{force:true});
   await fs.rm(path.join(ROOT,stamp+'.css'),{force:true});
  }
 }finally{
  child.kill('SIGTERM');await once(child,'exit').catch(()=>{});
  await runner.close();
  const dirname=path.join(ROOT,'proofs/mathlib');
  try{const entries=await fs.readdir(dirname);if(entries.length===0)await fs.rmdir(dirname);}catch{}
 }
});
