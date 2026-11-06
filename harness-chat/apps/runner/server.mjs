// Container-only executor. Deliberately accepts commands solely from internal Compose network.
// No API keys and no Docker socket are present inside this container.
import http from 'node:http';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const workspace=process.env.RUNNER_WORKSPACE||'/workspace';
const PORT=Number(process.env.RUNNER_PORT||8790);
const socketPath=process.env.RUNNER_SOCKET||'';
const MAX_OUTPUT=14000;
if(typeof process.env.RUNNER_TOKEN!=='string'||process.env.RUNNER_TOKEN.length<16)throw Error('RUNNER_TOKEN obrigatório (mínimo 16 caracteres)');
// In Docker the service holds only CHOWN, SETUID, SETGID; commands run as a separate unprivileged UID.
const EXEC_UID=process.env.RUNNER_EXEC_UID?Number(process.env.RUNNER_EXEC_UID):undefined;
const EXEC_GID=process.env.RUNNER_EXEC_GID?Number(process.env.RUNNER_EXEC_GID):undefined;
const SOCKET_UID=process.env.RUNNER_SOCKET_UID?Number(process.env.RUNNER_SOCKET_UID):1000;
const SOCKET_GID=process.env.RUNNER_SOCKET_GID?Number(process.env.RUNNER_SOCKET_GID):1000;
if((EXEC_UID!==undefined||EXEC_GID!==undefined)&&(!Number.isInteger(EXEC_UID)||!Number.isInteger(EXEC_GID)||EXEC_UID<1||EXEC_GID<1))throw Error('RUNNER_EXEC_UID/GID inválidos');
async function handoff(root){
 if(EXEC_UID===undefined)return;
 const visit=async p=>{const info=await fs.lstat(p);if(info.isSymbolicLink())throw Error('Link não permitido na cópia');
  if(info.isDirectory()){for(const name of await fs.readdir(p))await visit(path.join(p,name));await fs.chmod(p,0o755);}
  await fs.chown(p,EXEC_UID,EXEC_GID);};
 await visit(root);
}
const reply=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value));};
async function run(command,runtime,seconds,readonly,signal){
 const max=Math.min(runtime==='lean'?240:45,Math.max(3,Number(seconds)||25));
 if(typeof command!=='string'||command.length>1600||!command.trim()||!['node','python','lean'].includes(runtime))throw new Error('Parâmetros inválidos');
 // Read-only verifications use a disposable copy. Executions work in the shared workspace.
 if(!readonly)throw new Error('Execução direta no workspace está desativada; use uma cópia descartável');
 if(signal?.aborted)throw Error('Execução cancelada');
 const work=await fs.mkdtemp(path.join(os.tmpdir(),'nhs-verify-'));
 if(readonly){
  const files=await fs.readdir(workspace);
  const blocked=new Set(['node_modules','.git','.npmrc','.pypirc','.ssh','secrets','.cache','__pycache__','.venv']);
  let fileCount=0,bytes=0;
  const allow=async src=>{
   if(signal?.aborted)throw Error('Execução cancelada');
   const relative=path.relative(workspace,src);
   const segments=relative.split(path.sep);
   if(segments.some(x=>blocked.has(x)||x.startsWith('.env')||x.endsWith('.pem')||x.endsWith('.key')))return false;
   if(relative.split(path.sep).slice(0,2).join('/')==='proofs/mathlib')return false;
   const info=await fs.lstat(src);
   if(info.isSymbolicLink()||(!info.isFile()&&!info.isDirectory()))return false;
   if(info.isFile()){
    fileCount++;bytes+=info.size;
    if(fileCount>8000||bytes>256*1024*1024)throw new Error('Workspace excede os limites da cópia descartável');
   }
   return true;
  };
  try{
   for(const name of files){
    if(blocked.has(name)||name.startsWith('.env'))continue;
    await fs.cp(path.join(workspace,name),path.join(work,name),{recursive:true,force:false,errorOnExist:true,filter:allow});
   }
  }catch(e){await fs.rm(work,{recursive:true,force:true}).catch(()=>{});throw e;}
 }
 if(signal?.aborted){await fs.rm(work,{recursive:true,force:true});throw Error('Execução cancelada');}
 try{await handoff(work);}catch(e){await fs.rm(work,{recursive:true,force:true}).catch(()=>{});throw e;}
 const started=Date.now();let stdout='',truncated=false,timedOut=false;
 const cmd='sh';
 const args=['-c',command];
 // Shell commands execute only inside the restricted runner container, never on the host.
 const child=spawn(cmd,args,{cwd:work,detached:true,stdio:['ignore','pipe','pipe'],
  ...(EXEC_UID!==undefined?{uid:EXEC_UID,gid:EXEC_GID}:{}),
  env:{PATH:process.env.PATH||'/usr/bin:/bin',HOME:'/tmp',ELAN_HOME:process.env.ELAN_HOME||'/opt/elan',PYTHONDONTWRITEBYTECODE:'1',NPM_CONFIG_CACHE:'/tmp/npm-cache',CI:'1'}});
 const append=b=>{const t=b.toString('utf8');if(stdout.length+t.length>MAX_OUTPUT)truncated=true;if(stdout.length<MAX_OUTPUT)stdout+=t.slice(0,MAX_OUTPUT-stdout.length);};
 child.stdout.on('data',append);child.stderr.on('data',append);
 const stop=()=>{if(!child.pid)return;try{process.kill(-child.pid,'SIGKILL');}catch{try{child.kill('SIGKILL');}catch{}}};
 const onAbort=()=>stop();
 signal?.addEventListener('abort',onAbort,{once:true});
 if(signal?.aborted)stop();
 let result;
 try{
  result=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{timedOut=true;stop();},max*1000);
   child.once('error',err=>{clearTimeout(timer);reject(err)});
   child.once('close',code=>{clearTimeout(timer);resolve(code)});
  });
 }finally{signal?.removeEventListener('abort',onAbort);await fs.rm(work,{recursive:true,force:true}).catch(()=>{});}
 if(signal?.aborted)throw Error('Execução cancelada');
 return {exit_code:result,runtime,duration_ms:Date.now()-started,output:stdout,truncated,timed_out:timedOut};
}
let busy=false;
const server=http.createServer(async(req,res)=>{
 if(req.method==='GET'&&req.url==='/health'){reply(res,200,{ok:true,container:true});return;}
 if(req.method!=='POST'||req.url!=='/run'){reply(res,404,{error:'not found'});return;}
 if(req.headers.authorization!==`Bearer ${process.env.RUNNER_TOKEN}`){reply(res,401,{error:'not authorized'});return;}
 if(busy){reply(res,429,{error:'runner occupied'});return;}
 busy=true;
 const controller=new AbortController();
 res.once('close',()=>{if(!res.writableEnded)controller.abort();});
 req.once('aborted',()=>controller.abort());
 try{
  let body='';for await(const c of req){body+=c.toString();if(body.length>5000)throw new Error('Body too large');}
  const data=JSON.parse(body);if(data.readonly!==true)throw new Error('Apenas execuções em cópia descartável são permitidas');const result=await run(data.command,data.runtime,data.timeout_seconds,true,controller.signal);if(!controller.signal.aborted)reply(res,200,result);
 }catch(e){if(!controller.signal.aborted)reply(res,400,{error:e instanceof Error?e.message:String(e)});}finally{busy=false;}
});
if(socketPath){
 await fs.mkdir(path.dirname(socketPath),{recursive:true});
 await fs.rm(socketPath,{force:true});
 server.listen(socketPath,async()=>{
  try{if(EXEC_UID!==undefined){await fs.chmod(socketPath,0o660);await fs.chown(socketPath,SOCKET_UID,SOCKET_GID);}
   console.log(`Offline runner listening on Unix socket ${socketPath}`);}
  catch(e){console.error('Falha nas permissões do socket',e);process.exit(1);}
 });
}else{
 server.listen(PORT,process.env.RUNNER_HOST||'127.0.0.1',()=>console.log(`Restricted runner listening on ${PORT}`));
}
