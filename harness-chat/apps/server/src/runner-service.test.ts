import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function freePort(){
 const s=http.createServer((_req,res)=>res.end());s.listen(0,'127.0.0.1');await once(s,'listening');
 const a=s.address();if(!a||typeof a==='string')throw new Error('no port');
 const port=a.port;await new Promise<void>(resolve=>s.close(()=>resolve()));return port;
}

test('serviço real do executor: comandos permitidos, cópia descartável e autorização',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'nhs-runner-test-'));
 const port=await freePort();const base=`http://127.0.0.1:${port}`;
 await fs.writeFile(path.join(folder,'marker.txt'),'source is unchanged');
 const child=spawn(process.execPath,['../runner/server.mjs'],{
  cwd:new URL('../',import.meta.url).pathname,
  env:{...process.env,RUNNER_SOCKET:'',RUNNER_PORT:String(port),RUNNER_HOST:'127.0.0.1',RUNNER_WORKSPACE:folder,RUNNER_TOKEN:'runner-test-token',...(process.getuid?.()===0?{RUNNER_EXEC_UID:'65534',RUNNER_EXEC_GID:'65534'}:{})},
  stdio:['ignore','pipe','pipe']
 });
 const post=(data:unknown,token='runner-test-token')=>fetch(base+'/run',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify(data)});
 try{
  let ready=false;
  for(let i=0;i<100;i++){
   if(child.exitCode!==null)throw Error('Executor saiu antes da inicialização');
   try{const r=await fetch(base+'/health');if(r.ok){ready=true;break;}}catch{await new Promise(resolve=>setTimeout(resolve,30));}
  }
  assert.equal(ready,true,'Runner não abriu a porta');
  const unauth=await post({command:'echo forbidden',runtime:'node'},'wrong');assert.equal(unauth.status,401);
  const result=await post({command:"node -e 'console.log(6*7)'",runtime:'node',readonly:true,timeout_seconds:8});
  const node=await result.json();assert.equal(node.exit_code,0);assert.match(node.output,/42/);
  if(process.getuid?.()===0){const who=await (await post({command:'id -u',runtime:'node',readonly:true})).json();assert.match(who.output,/65534/);}
  const python=await (await post({command:'python3 -c "print(3*7)"',runtime:'python',readonly:true,timeout_seconds:8})).json();
  assert.equal(python.exit_code,0);assert.match(python.output,/21/);
  const disposable=await (await post({command:'echo temporary > modified.txt',runtime:'node',readonly:true,timeout_seconds:8})).json();
  assert.equal(disposable.exit_code,0);
  await assert.rejects(fs.stat(path.join(folder,'modified.txt')));
  assert.equal(await fs.readFile(path.join(folder,'marker.txt'),'utf8'),'source is unchanged');
  const stop=new AbortController();
  const waiting=fetch(base+'/run',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer runner-test-token'},
   body:JSON.stringify({command:'sleep 30',runtime:'node',readonly:true,timeout_seconds:45}),signal:stop.signal});
  // Check that a long-running command occupies the executor.
  await new Promise(resolve=>setTimeout(resolve,200));
  const occupied=await post({command:'echo should-be-rejected',runtime:'node',readonly:true});
  assert.equal(occupied.status,429,'runner must be occupied during the long command');
  stop.abort();await waiting.catch(()=>{});
  let recovered=false;
  for(let i=0;i<35;i++){
   const r=await post({command:'echo recovered',runtime:'node',readonly:true});
   if(r.status===200){const data=await r.json();assert.match(data.output,/recovered/);recovered=true;break;}
   await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.equal(recovered,true,'a cancelled client should free the runner promptly');
  const direct=await post({command:'echo untrusted',runtime:'node',readonly:false});assert.equal(direct.status,400);
  await fs.symlink('/etc/passwd',path.join(folder,'untrusted-link.txt'));
  const noLink=await (await post({command:'test ! -e untrusted-link.txt && echo symlink-excluded',runtime:'node',readonly:true})).json();
  assert.equal(noLink.exit_code,0);assert.match(noLink.output,/symlink-excluded/);
  const bad=await post({command:'echo fail',runtime:'ruby'},'runner-test-token');assert.equal(bad.status,400);
 }finally{
  child.kill('SIGTERM');await once(child,'exit').catch(()=>{});await fs.rm(folder,{recursive:true,force:true});
 }
});

test('executor cancela subprocesso após desconexão do cliente, liberando a fila',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'nhs-cancel-test-'));
 const port=await freePort();const base=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['../runner/server.mjs'],{
  cwd:new URL('../',import.meta.url).pathname,
  env:{...process.env,RUNNER_SOCKET:'',RUNNER_PORT:String(port),RUNNER_HOST:'127.0.0.1',RUNNER_WORKSPACE:folder,RUNNER_TOKEN:'runner-test-token',...(process.getuid?.()===0?{RUNNER_EXEC_UID:'65534',RUNNER_EXEC_GID:'65534'}:{})},
  stdio:['ignore','pipe','pipe']
 });
 const body=(command:string)=>JSON.stringify({command,runtime:'node',readonly:true,timeout_seconds:10});
 const post=(command:string,signal?:AbortSignal)=>fetch(base+'/run',{method:'POST',signal,headers:{'content-type':'application/json',authorization:'Bearer runner-test-token'},body:body(command)});
 try{
  let ready=false;
  for(let i=0;i<80;i++){
   try{const r=await fetch(base+'/health');if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,30));
  }
  assert.equal(ready,true);
  const ac=new AbortController();
  const active=post('node -e "setTimeout(()=>console.log(42),8000)"',ac.signal).catch(()=>null);
  await new Promise(r=>setTimeout(r,180));ac.abort();await active;
  let result:any;
  for(let i=0;i<30;i++){
   const response=await post('node -e "console.log(99)"');
   if(response.status===200){result=await response.json();break;}
   assert.equal(response.status,429);
   await new Promise(r=>setTimeout(r,60));
  }
  assert.ok(result,'Executor deveria liberar fila após desconexão');
  assert.equal(result.exit_code,0);assert.match(result.output,/99/);
 }finally{child.kill('SIGTERM');await once(child,'exit').catch(()=>{});await fs.rm(folder,{recursive:true,force:true});}
});
