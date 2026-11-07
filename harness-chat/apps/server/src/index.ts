import http, {type IncomingMessage,type ServerResponse} from 'node:http';
import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {runSandbox,verifyChecks,probeRunner} from './runner.ts';
import {ROOT,listFiles,readFile} from './files.ts';
import {checkedPath,restore} from './workspace.ts';
import {runs,newRun,executeRun,listen,cancelRun} from './agent.ts';
import {parseChatRequest} from './chat.ts';
import {leanPolicyIssues} from './lean-policy.ts';
import {serializeTrace} from './trace.ts';
import {listSkills,createSkill,updateSkill,resolveSkills} from './skills.ts';
import {validateAttachments,parseBoundedJson,ATTACHMENT_LIMITS} from './attachments.ts';

const here=path.dirname(fileURLToPath(import.meta.url));
const project=path.resolve(here,'../../../');
if(existsSync(path.join(project,'.env')) && typeof process.loadEnvFile==='function')process.loadEnvFile(path.join(project,'.env'));
const HOST=process.env.HOST||'127.0.0.1';
const PORT=Number(process.env.PORT||8787);
const BASE_URL=(process.env.NVIDIA_BASE_URL||'https://integrate.api.nvidia.com/v1').replace(/\/$/,'');
if(BASE_URL!=='https://integrate.api.nvidia.com/v1'&&!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+\/v1$/.test(BASE_URL)){
 throw new Error('NVIDIA_BASE_URL exige o endpoint oficial HTTPS ou um NIM local (loopback)');
}
await fs.mkdir(ROOT,{recursive:true});
const publicDir=path.join(project,'apps/web/fallback');
const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf'};
const exposed=(r:any)=>({id:r.id,task:r.task,model:r.model,status:r.status,startedAt:r.startedAt,finishedAt:r.finishedAt,events:r.events,calls:r.calls,usage:r.usage,answer:r.answer,verification:r.verification,evidence:r.evidence,artifacts:r.artifacts});
const send=(res:ServerResponse,status:number,obj:unknown)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(obj));};
const bad=(res:ServerResponse,e:unknown,code=400)=>send(res,code,{error:e instanceof Error?e.message:String(e)});
async function body(req:IncomingMessage,maxBytes=64_000){const chunks:Buffer[]=[];let size=0;for await(const piece of req){const chunk=Buffer.isBuffer(piece)?piece:Buffer.from(piece);size+=chunk.length;if(size>maxBytes)throw new Error(`JSON excede ${maxBytes} bytes`);chunks.push(chunk);}return parseBoundedJson(Buffer.concat(chunks,size).toString('utf8'),maxBytes) as Record<string,unknown>;}
async function serveFile(res:ServerResponse,filename:string,preview=false){
 const type=mime[path.extname(filename).toLowerCase()];if(!type){send(res,415,{error:'Tipo de arquivo não permitido'});return;}
 try{const data=await fs.readFile(filename);if(data.length>4_000_000){bad(res,'Arquivo grande demais',413);return;}
  res.writeHead(200,{'content-type':type,'x-content-type-options':'nosniff','cache-control':'no-store',
   ...(preview?{'content-security-policy':"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'none'; form-action 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; sandbox allow-scripts",'referrer-policy':'no-referrer'}:{})});res.end(data);
 }catch{bad(res,'Arquivo não encontrado',404);}
}
// Render local HTML, CSS and JavaScript inside a self-contained opaque-origin iframe.
// External URLs remain blocked by CSP; the preview cannot read the NVIDIA key.
async function servePreview(res:ServerResponse,entry:string){
 if(!entry.toLowerCase().endsWith('.html')){bad(res,'Prévia aceita apenas arquivos HTML',415);return;}
 const full=await checkedPath(entry);
 const html=await fs.readFile(full,'utf8');
 if(Buffer.byteLength(html)>512*1024){bad(res,'HTML muito grande',413);return;}
 const dir=path.posix.dirname(entry.replaceAll('\\','/'));
 const asset=async(ref:string,extension:string)=>{
  if(!ref||ref.includes('://')||ref.startsWith('//')||ref.startsWith('/'))return null;
  const rel=path.posix.normalize(path.posix.join(dir,ref.split(/[?#]/,1)[0]));
  if(!rel.toLowerCase().endsWith(extension))return null;
  try{const target=await checkedPath(rel),s=await fs.stat(target);if(s.size>200_000||!s.isFile())return null;return await fs.readFile(target,'utf8');}catch{return null;}
 };
 let rendered=html;
 const links=[...rendered.matchAll(/<link\b[^>]*>/gi)];
 for(const link of links){
  const rel=link[0].match(/\brel\s*=\s*(["'])(.*?)\1/i)?.[2]?.toLowerCase()||'';
  const href=link[0].match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2]||'';
  if(!rel.split(/\s+/).includes('stylesheet'))continue;
  const css=await asset(href,'.css');if(css!==null)rendered=rendered.replace(link[0],`<style>\n${css.replace(/<\/style/gi,'<\\/style')}\n</style>`);
 }
 const scripts=[...rendered.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*><\/script>/gi)];
 for(const script of scripts){const js=await asset(script[1],'.js');if(js!==null)rendered=rendered.replace(script[0],`<script>\n${js.replace(/<\/script/gi,'<\\/script')}\n</script>`);}
 res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',
  'content-security-policy':"default-src 'none'; img-src data: blob:; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-scripts"});
 res.end(rendered);
}
function sameOrigin(req:IncomingMessage){
 const origin=req.headers.origin;if(!origin)return true;
 try{const u=new URL(origin);return (u.hostname==='127.0.0.1'||u.hostname==='localhost')&&(u.port===String(PORT)||u.port==='5173');}catch{return false;}
}
function safeLocalHost(host:string|undefined){
 if(!host)return false;
 try{const u=new URL(`http://${host}`);return ['127.0.0.1','localhost'].includes(u.hostname)&&(!u.port||u.port===String(PORT));}
 catch{return false;}
}
const server=http.createServer(async(req,res)=>{
 try{
  if(!safeLocalHost(req.headers.host)){send(res,403,{error:'Host local obrigatório; bloqueio contra DNS rebinding'});return;}
  if(req.method==='POST'&&req.headers['sec-fetch-site']==='cross-site'){send(res,403,{error:'Origem externa recusada'});return;}

  const u=new URL(req.url||'/',`http://${req.headers.host||'127.0.0.1'}`);
  const route=u.pathname;
  if(req.method==='POST'&&!sameOrigin(req)){send(res,403,{error:'Origem não autorizada'});return;}
  if(req.method==='GET'&&route==='/api/health'){
   send(res,200,{ok:true,runner:await probeRunner(),keyConfigured:!!process.env.NVIDIA_API_KEY,model:process.env.NVIDIA_MODEL||'nvidia/nemotron-3.5-bolt-e4b',workspace:'./workspace',sandbox:process.env.RUNNER_SOCKET?'container Docker sem rede (socket Unix)':process.env.RUNNER_URL?'executor HTTP configurado':'Docker CLI local obrigatório',preview:true,lean:{engine:'Lean 4 via Docker Compose',configured:!!(process.env.RUNNER_SOCKET||process.env.RUNNER_URL),mathlib:'instalação opcional'},modelEndpoint:BASE_URL});return;
  }
  if(req.method==='GET'&&route==='/api/doctor'){
   const runner=await probeRunner();
   const mathlib=existsSync(path.join(ROOT,'proofs/mathlib/lakefile.toml'))||existsSync(path.join(ROOT,'proofs/mathlib/lakefile.lean'));
   send(res,200,{version:'0.11.0',app:{ok:true},runner,mathlib:{prepared:mathlib,realCompilerTested:false},nvidia:{keyConfigured:!!process.env.NVIDIA_API_KEY,liveConnectionTested:false},
    hints:[!runner.available?'Inicie Docker Compose com start.ps1 ou start.sh.':null,!mathlib?'Mathlib opcional: setup-mathlib.ps1 ou setup-mathlib.sh.':null,!process.env.NVIDIA_API_KEY?'Configure a chave NVIDIA no .env ou forneça chave temporária no painel.':null].filter(Boolean),
    disclaimer:'Diagnóstico rápido. Para testar Lean, Python e Node reais use Testar ambientes; o probe NVIDIA é independente.'});return;
  }
  if(req.method==='POST'&&route==='/api/doctor/check'){
   const checks=[];
   for(const [name,command,runtime] of [['node','node --version','node'],['python',"python3 -c 'import numpy, sympy; print(42)'",'python'],['lean','lean --version','lean']] as const){
    try{const result=await runSandbox(command,new AbortController().signal,runtime,12,true);
      checks.push({name,ok:result.exit_code===0&&!result.truncated&&!result.timed_out,output:result.output.trim().slice(0,320),duration_ms:result.duration_ms});
    }catch(e){checks.push({name,ok:false,output:e instanceof Error?e.message:String(e),duration_ms:0});}
   }
   send(res,200,{ok:checks.every(c=>c.ok),checks,meaning:'Testes executados no executor isolado. Não testam a NVIDIA, Mathlib, nem segurança contra código hostil.'});return;
  }
  if(req.method==='POST'&&route==='/api/nvidia/probe'){
   const v=await body(req);
   const key=typeof v.key==='string'&&v.key.trim()?v.key.trim():process.env.NVIDIA_API_KEY;
   const model=typeof v.model==='string'&&v.model.trim()?v.model.trim():process.env.NVIDIA_MODEL||'nvidia/nemotron-3.5-bolt-e4b';
   if(!key){bad(res,'Configure NVIDIA_API_KEY ou insira uma chave temporária');return;}
   if(typeof model!=='string'||model.length>140||!/^[-\w./]+$/.test(model)){bad(res,'ID de modelo inválido');return;}
   const started=performance.now();
   let upstream:Response;
   try{upstream=await fetch(BASE_URL+'/chat/completions',{
    method:'POST',signal:AbortSignal.timeout(90000),
    headers:{'content-type':'application/json',authorization:`Bearer ${key}`},
    body:JSON.stringify({model,messages:[{role:'user',content:'Responda exatamente: OK'}],max_tokens:128,temperature:0,...(model==='z-ai/glm-5.3-flash'?{reasoning_effort:'low',clear_thinking:true}:{})})
   });}catch(e){bad(res,`NVIDIA não respondeu: ${e instanceof Error?e.message:'timeout'}`,502);return;}
   const raw=(await upstream.text()).slice(0,3000);
   if(!upstream.ok){bad(res,`NVIDIA HTTP ${upstream.status}: ${raw.slice(0,350)}`,502);return;}
   try{
    const data=JSON.parse(raw);const answer=data?.choices?.[0]?.message?.content;
    if(typeof answer!=='string')throw new Error('Sem resposta textual da API');
    send(res,200,{ok:true,model,latency_ms:Math.round(performance.now()-started),reply:answer.slice(0,200),usage:data.usage||null,scope:'Este teste valida autenticação e chat, não chamadas de ferramenta nem Docker'});
   }catch(e){bad(res,`Resposta NVIDIA inválida: ${e instanceof Error?e.message:'JSON inválido'}`,502);}
   return;
  }
  if(req.method==='GET'&&route==='/api/lean/example'){
   send(res,200,{source:await fs.readFile(await checkedPath('proofs/Examples.lean'),'utf8'),path:'proofs/Examples.lean'});return;
  }
  if(req.method==='POST'&&route==='/api/lean/check'){
   const v=await body(req);
   if(typeof v.source!=='string'||!v.source.trim()||v.source.length>24000){bad(res,'Envie código Lean com até 24.000 caracteres');return;}
   const issues=leanPolicyIssues(v.source);
   if(issues.length){send(res,200,{passed:false,reason:issues.join('; '),output:'Código recusado pela política de provas estritas',checked:0});return;}
   const mathlib=v.mode==='mathlib';
   if(v.mode!==undefined&&!['core','mathlib'].includes(String(v.mode))){bad(res,'Modo Lean inválido: use core ou mathlib');return;}
   if(!mathlib&&/^\s*import\s+Mathlib/m.test(v.source)){bad(res,'Seu código importa Mathlib: selecione o modo mathlib e configure a extensão');return;}
   const rel=`proofs/${mathlib?'mathlib/':''}_scratch_${randomUUID().replaceAll('-','')}.lean`;
   const dest=await checkedPath(rel);await fs.mkdir(path.dirname(dest),{recursive:true});
   await fs.writeFile(dest,v.source,{flag:'wx'});
   try{
    const command=mathlib?`cd /workspace/proofs/mathlib && test -d .lake/packages/mathlib && lake env lean /workspace/${rel}`:`lean ${rel}`;
    const result=await runSandbox(command,new AbortController().signal,'lean',mathlib?90:40,true);
    send(res,200,{...result,passed:result.exit_code===0&&!result.timed_out&&!result.truncated,checked:1,output:result.output||'(Lean não retornou mensagens)'});
   }finally{await fs.rm(dest,{force:true});}
   return;
  }
  if(req.method==='POST'&&route==='/api/lean/verify'){
   const result=await verifyChecks(['lean_core'],new AbortController().signal);send(res,200,result);return;
  }
  if(req.method==='GET'&&route==='/api/files'){send(res,200,{files:await listFiles(300)});return;}
  if(req.method==='GET'&&route==='/api/skills'){send(res,200,{skills:await listSkills()});return;}
  if(req.method==='POST'&&route==='/api/skills'){
   const v=await body(req);const skill=await createSkill({name:v.name as string,description:v.description as string|undefined,instructions:v.instructions as string});send(res,201,{skill});return;
  }
  const skillMatch=route.match(/^\/api\/skills\/([a-z0-9][a-z0-9-]{0,47})$/);
  if(skillMatch&&req.method==='GET'){const [skill]=await resolveSkills([skillMatch[1]]);if(!skill){bad(res,'Skill não encontrada',404);return;}send(res,200,{skill});return;}
  if(skillMatch&&req.method==='PUT'){const v=await body(req);const skill=await updateSkill(skillMatch[1]!,{name:v.name as string,description:v.description as string|undefined,instructions:v.instructions as string});send(res,200,{skill});return;}
  if(req.method==='GET'&&route==='/api/file'){const p=u.searchParams.get('path')||'';send(res,200,{path:p,content:await readFile(p,1,400)});return;}
  if(req.method==='GET'&&route==='/api/revisions'){send(res,200,await restore('status'));return;}
  if(req.method==='POST'&&route==='/api/revisions/undo'){const v=await body(req);send(res,200,await restore('undo',typeof v.revision_id==='string'?v.revision_id:undefined));return;}
  if(req.method==='GET'&&route==='/api/runs'){send(res,200,{runs:[...runs.values()].reverse().map(exposed)});return;}
  if(req.method==='POST'&&route==='/api/runs'){
   const v=await body(req,ATTACHMENT_LIMITS.maxRequestBytes);const task=typeof v.task==='string'?v.task.trim():'';
   const model=typeof v.model==='string'?v.model.trim():(process.env.NVIDIA_MODEL||'nvidia/nemotron-3.5-bolt-e4b');
   const key=typeof v.key==='string'&&v.key.trim()?v.key.trim():process.env.NVIDIA_API_KEY;
   if(!task||task.length>5000){bad(res,'Tarefa precisa conter 1 a 5000 caracteres');return;}
   if(!model||model.length>140||!/^[-\w./]+$/.test(model)){bad(res,'Modelo inválido');return;}
   if(!key){bad(res,'Insira NVIDIA_API_KEY no .env ou uma chave temporária no painel');return;}
   if([...runs.values()].some(r=>r.status==='running')){bad(res,'Já existe uma execução ativa',409);return;}
   const {history,mode,skillIds}=parseChatRequest(v);const skills=await resolveSkills(skillIds);const attachments=await validateAttachments(v.attachments,model);
   const run=newRun(task,model,history,mode);run.skills=skills;run.attachments=attachments;send(res,202,{id:run.id});setImmediate(()=>void executeRun(run,key,BASE_URL));return;
  }
  const artifactMatch=route.match(/^\/api\/runs\/([0-9a-f-]{36})\/artifacts\/([a-f0-9]{24})$/);
  if(artifactMatch&&req.method==='GET'){
   const run=runs.get(artifactMatch[1]);const artifact=run?.artifacts.find(item=>item.id===artifactMatch[2]);if(!run||!artifact){bad(res,'Artefato não encontrado',404);return;}
   const full=await checkedPath(artifact.path),stat=await fs.stat(full);if(!stat.isFile()||stat.size>4*1024*1024||stat.size!==artifact.size){bad(res,'Artefato indisponível ou alterado',404);return;}
   const bytes=await fs.readFile(full);if(createHash('sha256').update(bytes).digest('hex')!==artifact.sha256){bad(res,'Hash do artefato não corresponde',409);return;}
   const inline=artifact.mimeType.startsWith('image/')&&['image/png','image/jpeg','image/webp'].includes(artifact.mimeType);
   res.writeHead(200,{'content-type':artifact.mimeType,'content-length':String(bytes.length),'content-disposition':`${inline?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(artifact.name)}`,'cache-control':'no-store','x-content-type-options':'nosniff',...(inline?{'content-security-policy':"default-src 'none'; sandbox"}:{})});res.end(bytes);return;
  }
  const traceMatch=route.match(/^\/api\/runs\/([0-9a-f-]{36})\/(trace|export)$/);
  if(traceMatch){const run=runs.get(traceMatch[1]);if(!run){bad(res,'Execução não encontrada',404);return;}if(req.method==='GET'){if(traceMatch[2]==='export')res.setHeader('content-disposition',`attachment; filename="trace-${run.id}.json"`);send(res,200,serializeTrace(run));return;}}
  const match=route.match(/^\/api\/runs\/([0-9a-f-]{36})(?:\/(events|cancel))?$/);
  if(match){const run=runs.get(match[1]);if(!run){bad(res,'Execução não encontrada',404);return;}
   if(req.method==='GET'&&match[2]==='events'){
    res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache, no-transform','connection':'keep-alive','x-content-type-options':'nosniff'});
    const lastId=Number(req.headers['last-event-id']||0);const push=(event:any)=>res.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`);
    run.events.filter(e=>e.id>lastId).forEach(push);
    const unsubscribe=listen(run.id,(_,event)=>push(event));const pulse=setInterval(()=>res.write(':heartbeat\n\n'),10000);
    res.on('close',()=>{unsubscribe();clearInterval(pulse);});return;
   }
   if(req.method==='POST'&&match[2]==='cancel'){cancelRun(run);send(res,200,{ok:true});return;}
   if(req.method==='GET'&&!match[2]){send(res,200,exposed(run));return;}
  }
  if(req.method==='GET'&&route.startsWith('/preview/')){
   const rel=decodeURIComponent(route.slice('/preview/'.length));
   await servePreview(res,rel);return;
  }
  if(req.method==='GET'&&!route.startsWith('/api/')){
   if(!existsSync(publicDir)){send(res,503,{error:'Interface estática ausente'});return;}
   const rel=decodeURIComponent(route.slice(1))||'index.html';const full=path.resolve(publicDir,rel);
   if(full!==publicDir&&!full.startsWith(publicDir+path.sep)){bad(res,'Caminho inválido',403);return;}
   await serveFile(res,existsSync(full)?full:path.join(publicDir,'index.html'));return;
  }
  bad(res,'Rota não encontrada',404);
 }catch(e){bad(res,e);}
});
server.listen(PORT,HOST,()=>console.log(`NVIDIA Harness Studio: http://${HOST}:${PORT}`));
