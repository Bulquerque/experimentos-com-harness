import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import http from 'node:http';
import {ROOT,listFiles,loadText,checkedPath} from './workspace.ts';
import fs from 'node:fs/promises';
import type {CheckName} from './assurance.ts';
import {assertLeanPolicy} from './lean-policy.ts';

export async function probeRunner():Promise<{available:boolean;transport:string;detail:string}> {
 if(process.env.RUNNER_SOCKET){
  return await new Promise(resolve=>{
   const req=http.get({socketPath:process.env.RUNNER_SOCKET,path:'/health',timeout:900},res=>{
    let data='';res.on('data',part=>{data+=String(part).slice(0,1000);});
    res.on('end',()=>{try{const status=JSON.parse(data);resolve({available:res.statusCode===200&&status.ok===true,transport:'unix-socket',detail:status.ok?'Executor respondeu ao healthcheck':'Resposta inválida do executor'});}catch{resolve({available:false,transport:'unix-socket',detail:'Healthcheck inválido'});}});
   });
   req.on('timeout',()=>req.destroy(new Error('Timeout do executor')));
   req.on('error',err=>resolve({available:false,transport:'unix-socket',detail:err.message.slice(0,160)}));
  });
 }
 if(process.env.RUNNER_URL){
  try{const response=await fetch(process.env.RUNNER_URL.replace(/\/$/,'')+'/health',{signal:AbortSignal.timeout(1000)});
   const data=await response.json();return {available:response.ok&&data.ok===true,transport:'http',detail:response.ok?'Executor respondeu ao healthcheck':'Healthcheck falhou'};
  }catch(e){return {available:false,transport:'http',detail:e instanceof Error?e.message:'Sem conexão'};}
 }
 return {available:false,transport:'docker-compose',detail:'Executor isolado não configurado. Inicie com start.ps1 ou start.sh'};
}

function runnerToken():string{
 const token=process.env.RUNNER_TOKEN;
 if(typeof token!=='string'||token.length<16)throw new Error('RUNNER_TOKEN ausente ou curto. Inicie com start.ps1 ou start.sh.');
 return token;
}
export type Runtime='node'|'python'|'lean';
export type Execution={exit_code:number|null;runtime:Runtime;duration_ms:number;output:string;truncated:boolean;timed_out:boolean};
export async function runSandbox(command:string,signal:AbortSignal,runtime:Runtime='node',timeoutSeconds=25,readonly=false):Promise<Execution>{
 if(typeof command!=='string'||!command.trim()||command.length>1600)throw new Error('Comando inválido ou muito extenso');
 if(!['node','python','lean'].includes(runtime))throw new Error('Runtime não suportado');
 const limit=Math.max(3,Math.min(runtime==='lean'?240:45,Math.floor(timeoutSeconds)));
 if(process.env.RUNNER_SOCKET){
  return await runBySocket(process.env.RUNNER_SOCKET,{command,runtime,timeout_seconds:limit,readonly},signal,limit);
 }
 if(process.env.RUNNER_URL){
  const reply=await fetch(process.env.RUNNER_URL.replace(/\/$/,'')+'/run',{method:'POST',signal:AbortSignal.any([signal,AbortSignal.timeout((limit+5)*1000)]),headers:{'Content-Type':'application/json','Authorization':`Bearer ${runnerToken()}`},body:JSON.stringify({command,runtime,timeout_seconds:limit,readonly})});
  if(!reply.ok)throw new Error(`Executor isolado HTTP ${reply.status}: ${(await reply.text()).slice(0,240)}`);
  const output=await reply.json() as Execution;
  if(typeof output.exit_code!=='number'&&output.exit_code!==null)throw new Error('Resposta inválida do executor');
  return output;
 }
 if(runtime==='lean')throw new Error('Lean 4 requer o executor Docker Compose com Lean instalado. Inicie por start.ps1 ou start.sh.');
 throw new Error('Executor ausente. Inicie o sistema pelo Docker Compose (start.ps1 ou start.sh), que mantém a chave NVIDIA separada do ambiente de código.');
}
async function runBySocket(socketPath:string,requestData:{command:string;runtime:Runtime;timeout_seconds:number;readonly:boolean},signal:AbortSignal,seconds:number):Promise<Execution>{
 return await new Promise<Execution>((resolve,reject)=>{
  const payload=JSON.stringify(requestData);
  let done=false;
  const timeout=AbortSignal.timeout((seconds+8)*1000);
  const finish=(error?:Error,value?:Execution)=>{
   if(done)return;
   done=true;
   signal.removeEventListener('abort',onAbort);
   timeout.removeEventListener('abort',onTimeout);
   if(error)reject(error);else resolve(value!);
  };
  const onAbort=()=>{req.destroy(new Error('Execução cancelada'));};
  const onTimeout=()=>{req.destroy(new Error('Executor excedeu o tempo limite'));};
  const req=http.request({socketPath,path:'/run',method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${runnerToken()}`,'content-length':Buffer.byteLength(payload)}},res=>{
   let content='';
   res.on('data',(chunk:Buffer)=>{content+=chunk.toString();if(content.length>35000)req.destroy(new Error('Resposta excessiva do executor'));});
   res.on('end',()=>{
    if(res.statusCode!==200){finish(new Error(`Executor HTTP ${res.statusCode}: ${content.slice(0,240)}`));return;}
    try{const value=JSON.parse(content) as Execution;if(typeof value.exit_code!=='number'&&value.exit_code!==null)throw new Error('Executor retornou código inválido');finish(undefined,value);}
    catch(e){finish(e instanceof Error?e:new Error(String(e)));}
   });
  });
  req.on('error',e=>finish(new Error(`Executor indisponível: ${e.message}`)));
  signal.addEventListener('abort',onAbort,{once:true});
  timeout.addEventListener('abort',onTimeout,{once:true});
  if(signal.aborted)onAbort();
  else if(timeout.aborted)onTimeout();
  req.end(payload);
 });
}
export type Check=CheckName;
const COMMANDS:Record<Exclude<Check,'web_assets'|'web_script_syntax'>,{runtime:Runtime;command:string}>= {
 node_tests:{runtime:'node',command:'node --test'},
 npm_test:{runtime:'node',command:'npm test'},
 npm_build:{runtime:'node',command:'npm run build'},
 python_tests:{runtime:'python',command:'python3 -m unittest discover -v'},
 python_compile:{runtime:'python',command:'python3 -m compileall -q .'},
 node_syntax:{runtime:'node',command:`test -n "$(find . -type d \\( -name node_modules -o -name .git -o -name dist \\) -prune -o -type f \\( -name '*.js' -o -name '*.mjs' -o -name '*.cjs' \\) -print -quit)" && find . -type d \\( -name node_modules -o -name .git -o -name dist \\) -prune -o -type f \\( -name '*.js' -o -name '*.mjs' -o -name '*.cjs' \\) -exec sh -c 'for file do node --check "$file" || exit 1; done' sh {} +`},
 lean_core:{runtime:'lean',command:`test -n "$(find proofs -path proofs/mathlib -prune -o -type f -name '*.lean' ! -name '_scratch_*' -print -quit)" && find proofs -path proofs/mathlib -prune -o -type f -name '*.lean' ! -name '_scratch_*' -exec sh -c 'for file do if grep -nE "(^|[^[:alnum:]_])(sorry|admit)([^[:alnum:]_]|$)" "$file"; then echo "Prova incompleta: $file"; exit 1; fi; lean "$file" || exit 1; done' sh {} +`},
 mathlib_build:{runtime:'lean',command:`cd /workspace/proofs/mathlib && (test -f lakefile.toml || test -f lakefile.lean) && test -d .lake/packages/mathlib && test -n "$(find . -path './.lake' -prune -o -type f -name '*.lean' ! -name '_scratch_*' -print -quit)" && find . -path './.lake' -prune -o -type f -name '*.lean' ! -name '_scratch_*' -exec sh -c 'for file do lake env lean "$file" || exit 1; done' sh {} +`}
};
async function discoverMathlibProofs():Promise<string[]>{
 const base=path.join(ROOT,'proofs/mathlib');const result:string[]=[];
 async function scan(dir:string,depth:number):Promise<void>{
  if(depth>5||result.length>350)throw new Error('Mathlib: demasiados arquivos de prova para a verificação');
  for(const dirent of await fs.readdir(dir,{withFileTypes:true})){
   if(dirent.name.startsWith('.')||dirent.name==='_scratch_'||dirent.isSymbolicLink())continue;
   const absolute=path.join(dir,dirent.name);
   if(dirent.isDirectory())await scan(absolute,depth+1);
   else if(dirent.isFile()&&dirent.name.endsWith('.lean')&&!dirent.name.startsWith('_scratch_'))result.push(path.relative(ROOT,absolute).replaceAll(path.sep,'/'));
  }
 }
 if(existsSync(base))await scan(base,0);
 return result;
}
export async function verifyChecks(checks:Check[]|undefined,signal:AbortSignal){
 const paths=await listFiles(200);
 if(checks!==undefined&&!Array.isArray(checks))throw new Error('checks precisa ser uma lista');
 let planned=checks;
 if(!planned?.length){
  const packageJson=paths.includes('package.json')?JSON.parse(await loadText('package.json')):{};
  planned=[];
  if(packageJson.scripts?.test)planned.push('npm_test');
  if(packageJson.scripts?.build)planned.push('npm_build');
  if(paths.some(p=>p.endsWith('.test.js')||p.endsWith('.spec.js')))planned.push('node_tests');
  if(paths.some(p=>p.endsWith('.py')))planned.push('python_compile');
  if(paths.some(p=>p.endsWith('.lean')&&!p.startsWith('proofs/mathlib/')))planned.push('lean_core');
  if(existsSync(path.join(ROOT,'proofs/mathlib/lakefile.toml'))||existsSync(path.join(ROOT,'proofs/mathlib/lakefile.lean')))planned.push('mathlib_build');
  if(paths.some(p=>/(^|\/)test[^/]*\.py$/.test(p)))planned.push('python_tests');
  if(paths.some(p=>p.endsWith('.html')))planned.push('web_assets','web_script_syntax');
  if(paths.some(p=>p.endsWith('.js')))planned.push('node_syntax');
 }
 const selected=[...new Set(planned)];
 if(selected.length>8)throw new Error('Máximo de 8 verificações por solicitação');
 if(!selected.length)return {passed:false,checked:0,checks:[],reason:'Nenhum teste ou verificador compatível encontrado; conclusão não verificada'};
 const results:({name:Check;ok:boolean;exit_code:number|null;runtime:Runtime|'static';duration_ms:number;output:string;truncated:boolean;timed_out:boolean})[]=[];
 for(const check of selected){
  if(check==='web_assets'||check==='web_script_syntax'){
   results.push(check==='web_assets'?await checkWebAssets(paths):await checkWebScripts(paths));
   continue;
  }
  if(!Object.hasOwn(COMMANDS,check))throw new Error(`Verificador desconhecido: ${check}`);
  if(check==='lean_core'||check==='mathlib_build'){
   const mathFiles=check==='mathlib_build'?await discoverMathlibProofs():paths;
   const proofFiles=mathFiles.filter(p=>p.startsWith('proofs/')&&p.endsWith('.lean')&&(check==='mathlib_build'?p.startsWith('proofs/mathlib/'):!p.startsWith('proofs/mathlib/'))&&!p.split('/').at(-1)?.startsWith('_scratch_'));
   for(const file of proofFiles)assertLeanPolicy(await loadText(file));
  }
  const spec=COMMANDS[check];const result=await runSandbox(spec.command,signal,spec.runtime,check==='mathlib_build'?180:40,true);
  let ok=result.exit_code===0&&!result.timed_out&&!result.truncated;
  if(check==='node_tests'){const count=result.output.match(/(?:^|\n)(?:#|ℹ)?\s*tests\s+(\d+)\b/m);if(!count||Number(count[1])===0)ok=false;}
  if(check==='python_tests'){const count=result.output.match(/Ran\s+(\d+)\s+tests?\b/);if(!count||Number(count[1])===0)ok=false;}
  if(check==='mathlib_build'&&!(await discoverMathlibProofs()).length)ok=false;
  results.push({name:check,ok,...result});
 }

 return {passed:results.every(r=>r.ok),checked:results.length,checks:results,reason:results.every(r=>r.ok)?'Verificadores selecionados aprovados; requisitos não testados permanecem fora do escopo':'Um ou mais verificadores falharam'};
}

/** Static, dependency-free local HTML asset integrity check. Not a visual/browser test. */
export async function checkWebAssets(paths:string[]){
 const started=performance.now();
 const pages=paths.filter(p=>p.toLowerCase().endsWith('.html')&&!p.startsWith('proofs/mathlib/'));
 const problems:string[]=[];let references=0;
 if(!pages.length)problems.push('Nenhum arquivo HTML no workspace');
 for(const page of pages){
  let html:string;
  try{html=await loadText(page);}catch(e){problems.push(`${page}: não foi possível ler (${String(e)})`);continue;}
  if(!/<html(?:\s|>)/i.test(html)||!/<body(?:\s|>)/i.test(html))problems.push(`${page}: faltam tags <html> ou <body>`);
  // Check local script, stylesheet and image references. Ignore remote assets (preview blocks them).
  for(const m of html.matchAll(/<(script|link|img)\b([^>]+)>/gi)){
   const attrs=m[2],ref=attrs.match(/\b(?:src|href)\s*=\s*(["'])(.*?)\1/i)?.[2];
   if(!ref||ref.startsWith('#')||ref.startsWith('data:')||ref.startsWith('blob:'))continue;
   const type=m[1].toLowerCase();if(type==='link'&&!/\brel\s*=\s*(["'])stylesheet\1/i.test(attrs))continue;
   if(/^(?:https?:)?\/\//i.test(ref)){problems.push(`${page}: recurso externo bloqueado na prévia (${ref.slice(0,100)})`);continue;}
   if(ref.startsWith('/')||ref.includes('\\')){problems.push(`${page}: referência absoluta ou inválida: ${ref}`);continue;}
   const name=ref.split(/[?#]/,1)[0];if(!name)continue;
   const rel=path.posix.normalize(path.posix.join(path.posix.dirname(page),name));
   references++;
   try{const full=await checkedPath(rel);const stat=await fs.stat(full);if(!stat.isFile())throw Error('não é arquivo');}
   catch{problems.push(`${page}: referência ausente ou protegida: ${ref}`);}
  }
 }
 const ok=problems.length===0;
 return {name:'web_assets' as const,ok,exit_code:ok?0:1,runtime:'static' as const,duration_ms:Math.round(performance.now()-started),
  output:[`HTMLs inspecionados: ${pages.length}; referências locais: ${references}.`,...problems].join('\n'),truncated:false,timed_out:false};
}

/** Syntax-only verification of browser JavaScript. Never evaluates the source. */
export async function checkWebScripts(paths:string[]){
 const started=performance.now();const errors:string[]=[];let checked=0;
 const pages=paths.filter(p=>p.toLowerCase().endsWith('.html')&&!p.startsWith('proofs/mathlib/'));
 const parse=(source:string,file:string,module:boolean)=>{
  if(source.length>500_000){errors.push(`${file}: script acima de 500 KB`);return;}
  checked++;
  // node --check parses only; it does not execute module imports or user code.
  const args=['--check','--input-type='+ (module?'module':'commonjs')];
  const child=spawnSync(process.execPath,args,{input:source,encoding:'utf8',timeout:2500,maxBuffer:100_000});
  if(child.error||child.status!==0)errors.push(`${file}: erro sintático em JavaScript (${String(child.stderr||child.error||'erro no parser').trim().slice(0,350)})`);
 };
 for(const page of pages){
  let html:string;try{html=await loadText(page);}catch(e){errors.push(`${page}: erro ao ler HTML (${String(e)})`);continue;}
  const tags=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
  if(tags.length>150){errors.push(`${page}: excesso de scripts`);continue;}
  for(const [index,tag] of tags.entries()){
   const attrs=tag[1],inline=tag[2];
   const type=attrs.match(/\btype\s*=\s*(["'])(.*?)\1/i)?.[2]?.trim().toLowerCase()||'';
   if(type&&!['module','text/javascript','application/javascript'].includes(type))continue;
   const module=type==='module';
   const source=attrs.match(/\bsrc\s*=\s*(["'])(.*?)\1/i)?.[2];
   if(source){
    if(/^(?:https?:)?\/\//.test(source)||source.startsWith('/')||source.includes('\\'))continue; // web_assets reports unsafe references
    const rel=path.posix.normalize(path.posix.join(path.posix.dirname(page),source.split(/[?#]/,1)[0]));
    try{parse(await loadText(rel),rel,module||rel.endsWith('.mjs'));}catch{ /* web_assets reports missing files */ }
   }else if(inline.trim())parse(inline,`${page}:script${index+1}`,module);
  }
 }
 const ok=errors.length===0;
 return {name:'web_script_syntax' as const,ok,exit_code:ok?0:1,runtime:'static' as const,duration_ms:Math.round(performance.now()-started),output:[`Scripts JavaScript analisados: ${checked}. Verificação apenas sintática; não executa navegador.`,...errors].join('\n'),truncated:false,timed_out:false};
}
