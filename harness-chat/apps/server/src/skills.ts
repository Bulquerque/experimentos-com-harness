import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ROOT,sha} from './workspace.ts';

/** Filesystem-backed, app-owned skills. Skill content is always plain guidance text. */
export const SKILLS_ROOT=path.join(ROOT,'skills');
export const MAX_SKILL_BYTES=32*1024;
export const MAX_SELECTED_SKILLS=3;
export const MAX_SELECTED_BYTES=64*1024;
const MAX_NAME=80;
const MAX_DESCRIPTION=500;
const ID_RE=/^[a-z0-9][a-z0-9-]{0,47}$/;
const META_FILE='skill.json';
const CONTENT_FILE='SKILL.md';

export type SkillMetadata={id:string;name:string;description:string;version:number;contentHash:string;updatedAt:string};
export type SkillSnapshot={id:string;name:string;version:number;contentHash:string;instructions:string};
export type SkillInput={name:string;description?:string;instructions:string};
type StoredSkill=SkillMetadata;

function validateText(value:unknown,label:string,max:number,required:boolean):string{
 if(typeof value!=='string')throw new Error(`${label} deve ser texto`);
 const normalized=value.trim();
 if(required&&!normalized)throw new Error(`${label} não pode ficar vazio`);
 if(normalized.includes('\0'))throw new Error(`${label} contém caractere inválido`);
 if(Buffer.byteLength(normalized,'utf8')>max)throw new Error(`${label} excede o limite de ${max} bytes`);
 return normalized;
}
function validateInput(input:SkillInput){
 if(!input||typeof input!=='object')throw new Error('Dados da skill inválidos');
 const name=validateText(input.name,'Nome',MAX_NAME,true);
 const description=validateText(input.description??'', 'Descrição',MAX_DESCRIPTION,false);
 const instructions=validateText(input.instructions,'Instruções',MAX_SKILL_BYTES,true);
 // Front matter is optional, but if present it must have a closing delimiter.
 if(instructions.startsWith('---\n')&&!/^---\n[\s\S]*?\n---(?:\n|$)/.test(instructions))throw new Error('Front matter Markdown incompleto');
 return {name,description,instructions};
}
function slugBase(name:string){
 const slug=name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48).replace(/-+$/g,'');
 return slug||'skill';
}
function safeId(id:string){if(typeof id!=='string'||!ID_RE.test(id))throw new Error('ID de skill inválido');return id;}
function boundedMetadata(raw:unknown,id:string):StoredSkill{
 if(!raw||typeof raw!=='object')throw new Error(`Metadados inválidos para ${id}`);
 const v=raw as Record<string,unknown>;
 if(v.id!==id||!Number.isSafeInteger(v.version)||(v.version as number)<1||typeof v.contentHash!=='string'||! /^[a-f0-9]{64}$/.test(v.contentHash)||typeof v.updatedAt!=='string')throw new Error(`Metadados inválidos para ${id}`);
 return {id,name:validateText(v.name,'Nome',MAX_NAME,true),description:validateText(v.description,'Descrição',MAX_DESCRIPTION,false),version:v.version as number,contentHash:v.contentHash,updatedAt:v.updatedAt};
}

async function assertNoSymlinks(target:string,allowMissing=true){
 // Walk from the trusted workspace root, rejecting symlinked parents and leaves.
 const relative=path.relative(ROOT,target);
 if(relative.startsWith('..')||path.isAbsolute(relative)||!relative)throw new Error('Caminho fora do workspace bloqueado');
 let current=ROOT;
 for(const part of relative.split(path.sep)){
  current=path.join(current,part);
  try{const st=await fs.lstat(current);if(st.isSymbolicLink())throw new Error('Link simbólico bloqueado');}
  catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT'&&allowMissing)break;throw e;}
 }
}
async function ensureRoot(){
 await assertNoSymlinks(SKILLS_ROOT);
 await fs.mkdir(SKILLS_ROOT,{recursive:true});
 await assertNoSymlinks(SKILLS_ROOT,false);
 const real=await fs.realpath(SKILLS_ROOT);
 if(real!==path.resolve(SKILLS_ROOT))throw new Error('Raiz do catálogo não canônica');
}
function skillDir(id:string){safeId(id);return path.join(SKILLS_ROOT,id);}
async function readStored(id:string){
 const dir=skillDir(id),metaPath=path.join(dir,META_FILE),contentPath=path.join(dir,CONTENT_FILE);
 await assertNoSymlinks(dir,false);await assertNoSymlinks(metaPath,false);await assertNoSymlinks(contentPath,false);
 const [metaStat,contentStat]=await Promise.all([fs.stat(metaPath),fs.stat(contentPath)]);
 if(!metaStat.isFile()||metaStat.size>8*1024||!contentStat.isFile()||contentStat.size>MAX_SKILL_BYTES)throw new Error(`Arquivos inválidos para a skill ${id}`);
 const metadata=boundedMetadata(JSON.parse(await fs.readFile(metaPath,'utf8')),id);
 const instructions=await fs.readFile(contentPath,'utf8');
 if(instructions.includes('\0')||Buffer.byteLength(instructions,'utf8')>MAX_SKILL_BYTES||sha(instructions)!==metadata.contentHash)throw new Error(`Conteúdo da skill ${id} inválido ou alterado`);
 return {metadata,instructions};
}
async function atomicCreateFile(file:string,data:string){
 const tmp=`${file}.tmp-${randomUUID()}`;
 try{await fs.writeFile(tmp,data,{flag:'wx',mode:0o600});await fs.rename(tmp,file);}finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
}
async function listIds(){
 await ensureRoot();
 const entries=await fs.readdir(SKILLS_ROOT,{withFileTypes:true});
 return entries.filter(e=>e.isDirectory()&&!e.isSymbolicLink()&&ID_RE.test(e.name)).map(e=>e.name).sort();
}

/** Returns metadata only; instruction bodies are read only when selected. */
export async function listSkills():Promise<SkillMetadata[]>{
 const skills:SkillMetadata[]=[];
 for(const id of await listIds())skills.push((await readStored(id)).metadata);
 return skills;
}
/** Creates a skill with a server-generated, collision-safe slug. */
export async function createSkill(input:SkillInput):Promise<SkillMetadata>{
 const data=validateInput(input);await ensureRoot();
 const base=slugBase(data.name);let id=base;
 for(let suffix=2;await fs.access(skillDir(id)).then(()=>true,()=>false);suffix++){
  const tail=`-${suffix}`;id=`${base.slice(0,48-tail.length).replace(/-+$/g,'')}${tail}`;
  if(suffix>10000)throw new Error('Não foi possível gerar um ID único para a skill');
 }
 const dir=skillDir(id);await fs.mkdir(dir,{mode:0o700});
 const metadata:SkillMetadata={id,name:data.name,description:data.description,version:1,contentHash:sha(data.instructions),updatedAt:new Date().toISOString()};
 try{await atomicCreateFile(path.join(dir,CONTENT_FILE),data.instructions);await atomicCreateFile(path.join(dir,META_FILE),JSON.stringify(metadata,null,2)+'\n');}
 catch(e){await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});throw e;}
 return metadata;
}
/** Updates a skill by stable ID; its slug remains unchanged and version increments. */
export async function updateSkill(id:string,input:SkillInput):Promise<SkillMetadata>{
 safeId(id);const data=validateInput(input);const {metadata}=await readStored(id);
 const next:SkillMetadata={id,name:data.name,description:data.description,version:metadata.version+1,contentHash:sha(data.instructions),updatedAt:new Date().toISOString()};
 const dir=skillDir(id);await assertNoSymlinks(dir,false);
 // Write both files atomically individually; restore prior values if the second write fails.
 const contentPath=path.join(dir,CONTENT_FILE),metaPath=path.join(dir,META_FILE);
 const oldContent=await fs.readFile(contentPath,'utf8'),oldMeta=await fs.readFile(metaPath,'utf8');
 await atomicCreateFile(contentPath+'.next',data.instructions).then(async()=>{await fs.rename(contentPath+'.next',contentPath);});
 try{await atomicCreateFile(metaPath+'.next',JSON.stringify(next,null,2)+'\n');await fs.rename(metaPath+'.next',metaPath);}
 catch(e){await atomicCreateFile(contentPath+'.rollback',oldContent).then(()=>fs.rename(contentPath+'.rollback',contentPath)).catch(()=>{});await fs.writeFile(metaPath,oldMeta).catch(()=>{});throw e;}
 return next;
}
/** Resolves and snapshots unique IDs for a run, enforcing both count and aggregate byte limits. */
export async function resolveSkills(ids:unknown):Promise<SkillSnapshot[]>{
 if(ids===undefined||ids===null)return [];
 if(!Array.isArray(ids)||ids.length>MAX_SELECTED_SKILLS)throw new Error(`Selecione no máximo ${MAX_SELECTED_SKILLS} skills`);
 const seen=new Set<string>(),snapshots:SkillSnapshot[]=[];let total=0;
 const selected=ids.map(raw=>safeId(raw as string));
 for(const id of selected){
  if(seen.has(id))throw new Error('IDs de skill duplicados não são permitidos');seen.add(id);
 }
 for(const id of selected){
  const {metadata,instructions}=await readStored(id);total+=Buffer.byteLength(instructions,'utf8');
  if(total>MAX_SELECTED_BYTES)throw new Error(`Skills selecionadas excedem ${MAX_SELECTED_BYTES} bytes`);
  snapshots.push({id,name:metadata.name,version:metadata.version,contentHash:metadata.contentHash,instructions});
 }
 return snapshots;
}
