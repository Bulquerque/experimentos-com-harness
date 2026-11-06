import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';

// Resolve relative to this source/dist file, not process.cwd() (npm workspaces).
export const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../workspace');
const ignored=new Set(['node_modules','.git','dist','.next','.cache','.venv','coverage','.DS_Store','.npmrc','.pypirc','.ssh','secrets']);
const MAX_FILE=512*1024;
export const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
export function safePath(rel:string){
 if(typeof rel!=='string'||!rel||rel.includes('\0')||rel.includes('\\')||path.isAbsolute(rel))throw new Error('Caminho relativo inválido');
 const full=path.resolve(ROOT,rel);
 if(full===ROOT||!full.startsWith(ROOT+path.sep))throw new Error('Acesso fora do workspace bloqueado');
 for(const p of path.relative(ROOT,full).split(path.sep))if(ignored.has(p)||p.toLowerCase().startsWith('.env')||p.startsWith('.git'))throw new Error('Caminho protegido');
 return full;
}
export async function checkedPath(rel:string){
 const full=safePath(rel);let current=ROOT;
 for(const segment of path.relative(ROOT,full).split(path.sep).filter(Boolean)){
  current=path.join(current,segment);
  try{const s=await fs.lstat(current);if(s.isSymbolicLink())throw new Error('Link simbólico bloqueado');}
  catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')break;throw e;}
 }
 return full;
}
export async function listFiles(max=140){
 const out:string[]=[];
 const visit=async(dir:string,depth:number):Promise<void>=>{
  if(depth>6||out.length>=max)return;
  const entries=(await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name));
  for(const f of entries){
   if(f.isSymbolicLink()||ignored.has(f.name)||f.name.toLowerCase().startsWith('.env')||f.name.startsWith('.git'))continue;
   const rel=path.relative(ROOT,path.join(dir,f.name)).replaceAll(path.sep,'/');
   out.push(f.isDirectory()?rel+'/':rel);if(out.length>=max)return;
   // Mathlib pode conter dezenas de milhares de arquivos: exiba o diretório, não indexe a dependência.
   if(f.isDirectory()&&rel!=='proofs/mathlib')await visit(path.join(dir,f.name),depth+1);
  }
 };
 await visit(ROOT,0);return out;
}
export async function loadText(rel:string){
 const absolute=await checkedPath(rel),stat=await fs.stat(absolute);
 if(!stat.isFile()||stat.size>MAX_FILE)throw new Error('Apenas arquivos de texto até 512 KB');
 const text=await fs.readFile(absolute,'utf8');if(text.includes('\0'))throw new Error('Arquivo binário não suportado');
 return text;
}
export async function inspect(rel:string,start=1,count=100){
 const text=await loadText(rel),all=text.split('\n');
 const from=Math.max(1,Math.floor(start)),to=Math.min(all.length,from-1+Math.min(160,Math.max(1,Math.floor(count))));
 return {path:rel,sha256:sha(text),total_lines:all.length,range:[from,to],content:all.slice(from-1,to).map((s,i)=>`${from+i}: ${s}`).join('\n')};
}
export async function explore(query='',max=90){
 const all=await listFiles(300),limit=Math.max(1,Math.min(100,max));
 if(!query)return {mode:'tree',files:all.slice(0,limit),listed:Math.min(all.length,limit),truncated:all.length>limit};
 if(query.length>120)throw new Error('Busca muito extensa');
 const found:{path:string;line:number;snippet:string}[]=[];
 for(const rel of all){
  if(found.length>=limit)break;
  if(rel.toLowerCase().includes(query.toLowerCase()))found.push({path:rel,line:0,snippet:'Nome do arquivo corresponde'});
  if(rel.endsWith('/'))continue;
  try{
   const data=await loadText(rel);
   data.split('\n').forEach((s,i)=>{if(found.length<limit&&s.toLowerCase().includes(query.toLowerCase()))found.push({path:rel,line:i+1,snippet:s.trim().slice(0,220)});});
  }catch{/* skip large/binary */}
 }
 return {mode:'search',query,results:found,truncated:found.length===limit};
}
export function replaceUnique(text:string,oldText:string,newText:string){
 if(!oldText)throw new Error('Trecho original não pode ser vazio');
 const first=text.indexOf(oldText);
 if(first===-1){
  const hint=oldText.split('\n')[0]?.trim();
  const candidates=text.split('\n').map((s,i)=>({i:i+1,s})).filter(o=>hint&&o.s.includes(hint.slice(0,Math.min(hint.length,30)))).slice(0,3);
  throw new Error(`Trecho exato não encontrado. Candidatos: ${JSON.stringify(candidates)}`);
 }
 if(text.indexOf(oldText,first+oldText.length)!==-1)throw new Error('Trecho ambíguo: ocorrência múltipla; amplie old_text');
 return text.slice(0,first)+newText+text.slice(first+oldText.length);
}
export type Change={op:'create'|'replace';path:string;content?:string;old_text?:string;new_text?:string;expected_hash?:string};
type Revision={id:string;at:string;files:{path:string;before:string|null;afterHash:string}[];summary:string};
const revisions:Revision[]=[];
async function atomicWrite(full:string,data:string){
 const temp=full+`.tmp-${randomUUID()}`;
 try{await fs.writeFile(temp,data,{flag:'wx'});await fs.rename(temp,full);}finally{await fs.rm(temp,{force:true}).catch(()=>{});}
}
export async function changeBatch(actions:Change[],preview=false){
 if(!Array.isArray(actions)||!actions.length||actions.length>8)throw new Error('São necessárias 1 a 8 alterações');
 const seen=new Set<string>();const staged:{path:string;abs:string;before:string|null;after:string}[]=[];
 for(const a of actions){
  if(!a||!['create','replace'].includes(a.op))throw new Error('Operação inválida');
  const abs=await checkedPath(a.path);
  if(seen.has(abs))throw new Error('Cada arquivo pode aparecer uma vez por transação');seen.add(abs);
  const present=existsSync(abs);
  if(a.op==='create'&&present)throw new Error(`O arquivo ${a.path} já existe`);
  if(a.op==='replace'&&!present)throw new Error(`Arquivo ${a.path} inexistente`);
  const before=present?await loadText(a.path):null;
  if(a.expected_hash!==undefined&&!/^[a-f0-9]{64}$/.test(a.expected_hash))throw new Error('expected_hash deve ser SHA-256 em hexadecimal');
  if(a.expected_hash&&sha(before||'')!==a.expected_hash)throw new Error(`Conflito de versão em ${a.path}: expected_hash não corresponde`);
  if(a.op==='create'&&typeof a.content!=='string')throw new Error('create exige conteúdo textual');
  if(a.op==='replace'&&(typeof a.old_text!=='string'||typeof a.new_text!=='string'))throw new Error('replace exige old_text e new_text textuais');
  const after=a.op==='create'?a.content!:replaceUnique(before!,a.old_text!,a.new_text!);
  if(Buffer.byteLength(after,'utf8')>MAX_FILE)throw new Error('Resultado acima de 512 KB');
  if(after===before)throw new Error('Nenhuma alteração efetiva');
  staged.push({path:a.path,abs,before,after});
 }
 const changes=staged.map(a=>({path:a.path,kind:a.before===null?'create':'replace',before_sha256:a.before===null?null:sha(a.before),after_sha256:sha(a.after),old_preview:(a.before||'').slice(0,1200),new_preview:a.after.slice(0,1200),old_chars:a.before?.length||0,new_chars:a.after.length}));
 if(preview)return {applied:false,changes,message:'Prévia gerada; nenhuma alteração feita'};
 // Optimistic concurrency precondition checked again immediately before writing.
 for(const s of staged){if(s.before===null){if(existsSync(s.abs))throw new Error(`Conflito em ${s.path}`);}else if(await fs.readFile(s.abs,'utf8')!==s.before)throw new Error(`Conflito de escrita em ${s.path}`);}
 const applied:typeof staged=[];
 try{
  for(const s of staged){await fs.mkdir(path.dirname(s.abs),{recursive:true});await atomicWrite(s.abs,s.after);applied.push(s);}
 }catch(e){
  for(const s of applied.reverse()){
   try{if(s.before===null)await fs.rm(s.abs,{force:true});else await atomicWrite(s.abs,s.before);}catch{/* report original error */}
  }
  throw e;
 }
 const id=randomUUID().slice(0,12);
 revisions.push({id,at:new Date().toISOString(),summary:staged.map(s=>s.path).join(', '),files:staged.map(s=>({path:s.path,before:s.before,afterHash:sha(s.after)}))});
 if(revisions.length>50)revisions.shift();
 return {applied:true,revision_id:id,changes};
}
export async function restore(action:'status'|'undo',revisionId?:string){
 if(action==='status')return {revisions:revisions.map(r=>({id:r.id,at:r.at,files:r.files.map(f=>f.path),summary:r.summary}))};
 const last=revisions.at(-1);
 if(!last)throw new Error('Não há alterações para reverter');
 if(revisionId&&revisionId!==last.id)throw new Error('Somente a última transação pode ser desfeita para evitar conflitos');
 for(const f of last.files){const p=await checkedPath(f.path);if(!existsSync(p)||sha(await loadText(f.path))!==f.afterHash)throw new Error(`O arquivo ${f.path} mudou depois da transação; reversão recusada`);}
 for(const f of last.files){const p=await checkedPath(f.path);if(f.before===null)await fs.rm(p);else await atomicWrite(p,f.before);}
 revisions.pop();return {restored:true,revision_id:last.id,files:last.files.map(f=>f.path)};
}

export async function previewProject(entry:string){
  const rel=entry.replaceAll('\\','/');
  if(!rel.toLowerCase().endsWith('.html'))throw new Error('A prévia requer um arquivo HTML');
  const content=await loadText(rel);
  const includesScripts=/<script\b/i.test(content);
  return {available:true,entry:rel,url:'/preview/'+rel.split('/').map(encodeURIComponent).join('/'),scripts_present:includesScripts,warning:'Prévia no navegador isolado; disponibilidade não garante correção visual ou funcional'};
}
