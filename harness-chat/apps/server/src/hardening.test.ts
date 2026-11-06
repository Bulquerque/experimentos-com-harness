process.env.RUNNER_TOKEN = process.env.RUNNER_TOKEN || 'runner-test-token-123456';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {once} from 'node:events';
import {newRun,executeRun} from './agent.ts';
import {compactHistory} from './context.ts';
import {ROOT} from './workspace.ts';

async function createServer(handler:(req:http.IncomingMessage,res:http.ServerResponse)=>void){
 const s=http.createServer(handler);s.listen(0,'127.0.0.1');await once(s,'listening');
 const a=s.address();assert.ok(a&&typeof a!=='string');
 return {url:`http://127.0.0.1:${a.port}`,close:()=>new Promise<void>(r=>s.close(()=>r()))};
}
function message(msg:unknown){return JSON.stringify({choices:[{message:msg}],usage:{prompt_tokens:9,completion_tokens:8}});}
function call(name:string,args:unknown,id:string){return {role:'assistant',content:null,tool_calls:[{id,type:'function',function:{name,arguments:typeof args==='string'?args:JSON.stringify(args)}}]};}

// The mock always runs a genuine HTTP request/response sequence through the agent.
test('compactação preserva tarefa e pares de tool-calls sem inserir saída não confiável',()=>{
 const messages:any[]=[{role:'system',content:'instrucao'},{role:'user',content:'pedido'}];
 for(let i=0;i<8;i++)messages.push(call('orient',{},'c'+i),{role:'tool',tool_call_id:'c'+i,content:'DADO NÃO CONFIÁVEL '+'.'.repeat(1200)});
 messages.push({role:'assistant',content:'fim'});
 const count=compactHistory(messages,1500);
 assert.ok(count>0);
 assert.equal(messages[0].content,'instrucao');assert.equal(messages[1].content,'pedido');
 assert.ok(messages.some(m=>String(m.content).startsWith('[RESUMO OPERACIONAL]')));
 assert.ok(JSON.stringify(messages).split('DADO NÃO CONFIÁVEL').length-1<8,'dados antigos foram removidos do contexto');
 const calls=messages.filter(m=>m.role==='assistant'&&m.tool_calls);
 for(const entry of calls)for(const c of entry.tool_calls)assert.ok(messages.some(m=>m.role==='tool'&&m.tool_call_id===c.id));
});

test('falha de execução posterior invalida uma verificação anteriormente aprovada',async()=>{
 const planned=[call('verify',{checks:['python_tests']},'v'),call('execute',{runtime:'python',command:'python -c "raise Exception()"'},'x'),{role:'assistant',content:'Concluído'}];
 let i=0;
 const model=await createServer((_req,res)=>res.end(message(planned[i++]||planned.at(-1))));
 const runner=await createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=String(chunk);
  const data=JSON.parse(raw);const fail=data.command.includes('Exception');
  res.end(JSON.stringify({exit_code:fail?1:0,runtime:'python',duration_ms:2,output:fail?'Traceback':'Ran 2 tests in 0.1s\nOK',truncated:false,timed_out:false}));
 });
 const old=process.env.RUNNER_URL;process.env.RUNNER_URL=runner.url;
 try{
  const run=newRun('Verifique e experimente','mock/test');await executeRun(run,'test-key',model.url+'/v1');
  assert.equal(run.status,'unverified');assert.ok(run.events.some(e=>e.tool==='execute'&&e.ok===false));
  assert.ok(run.events.some(e=>e.type==='verification'&&e.detail.includes('executionFailedSinceVerify')));
 }finally{if(old===undefined)delete process.env.RUNNER_URL;else process.env.RUNNER_URL=old;await model.close();await runner.close();}
});

test('verificação anterior não cobre arquivo modificado externamente depois dos testes',async()=>{
 const file=`_hardening-${process.pid}-${Date.now()}.js`,full=path.join(ROOT,file);
 const planned=[call('transform',{actions:[{op:'create',path:file,content:'console.log(1)'}]},'edit'),call('verify',{checks:['node_syntax']},'verify'),{role:'assistant',content:'Passei os testes.'}];
 let i=0;
 const model=await createServer(async(_req,res)=>{
  if(i===2)await fs.writeFile(full,'console.log(99)');
  res.end(message(planned[i++]||planned.at(-1)));
 });
 const runner=await createServer((_req,res)=>res.end(JSON.stringify({exit_code:0,runtime:'node',duration_ms:2,output:'',truncated:false,timed_out:false})));
 const old=process.env.RUNNER_URL;process.env.RUNNER_URL=runner.url;
 try{
  const run=newRun('Crie e verifique um JavaScript','mock/test');await executeRun(run,'test-key',model.url+'/v1');
  assert.equal(run.status,'unverified');
  assert.ok(run.events.some(e=>e.type==='verification'&&e.detail.includes('"workspaceUnchanged":false')));
 }finally{if(old===undefined)delete process.env.RUNNER_URL;else process.env.RUNNER_URL=old;await model.close();await runner.close();await fs.rm(full,{force:true});}
});

test('argumentos inválidos retornam erro claro e não executam uma ferramenta com objeto vazio',async()=>{
 let calls=0;
 const model=await createServer((_req,res)=>res.end(message(calls++===0?call('orient','{json quebrado','bad'):{role:'assistant',content:'Mensagem recebida'})));
 try{
  const run=newRun('Teste argumentos inválidos','mock/test');await executeRun(run,'test-key',model.url+'/v1');
  assert.equal(run.status,'unverified');
  assert.ok(run.events.some(e=>e.tool==='orient'&&e.ok===false&&e.detail.includes('JSON objeto válido')));
 }finally{await model.close();}
});
