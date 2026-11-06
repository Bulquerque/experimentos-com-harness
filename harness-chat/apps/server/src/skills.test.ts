import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {SKILLS_ROOT,MAX_SKILL_BYTES,createSkill,listSkills,updateSkill,resolveSkills} from './skills.ts';
import {sha} from './workspace.ts';

const token=`test-${process.pid}-${randomUUID().slice(0,8)}`;
const input=(name:string,instructions='## Instructions\nDo the safe thing.'): {name:string;description:string;instructions:string}=>({name,description:'Reusable test skill',instructions});
const clean=async(ids:string[])=>Promise.all(ids.map(id=>fs.rm(path.join(SKILLS_ROOT,id),{recursive:true,force:true})));

test('cria/lista skill com slug de servidor, hash e metadados sem corpo de instruções',async()=>{
 const made:string[]=[];
 try{
  const first=await createSkill(input(`${token} Primeira`,'# Conteúdo\nTexto literal <script>não executa</script>'));
  made.push(first.id);
  const duplicateName=await createSkill(input(`${token} Primeira`,'Segunda versão do mesmo nome.'));
  made.push(duplicateName.id);
  assert.notEqual(first.id,duplicateName.id);
  assert.match(first.id,/^[a-z0-9][a-z0-9-]{0,47}$/);
  assert.equal(first.version,1);assert.equal(first.contentHash,sha('# Conteúdo\nTexto literal <script>não executa</script>'));
  const listed=(await listSkills()).find(s=>s.id===first.id)!;
  assert.equal(listed.name,first.name);assert.equal(listed.contentHash,first.contentHash);
  assert.equal('instructions' in listed,false);
  const [snapshot]=await resolveSkills([first.id]);
  assert.equal(snapshot.instructions,'# Conteúdo\nTexto literal <script>não executa</script>');
  assert.equal(snapshot.contentHash,first.contentHash);
 }finally{await clean(made);}
});

test('update mantém ID, incrementa versão e atualiza hash do snapshot',async()=>{
 let id='';
 try{
  const original=await createSkill(input(`${token} Atualizável`,'versão um'));id=original.id;
  const updated=await updateSkill(id,input('Novo nome','versão dois'));
  assert.equal(updated.id,id);assert.equal(updated.version,2);assert.equal(updated.contentHash,sha('versão dois'));
  assert.equal((await resolveSkills([id]))[0].instructions,'versão dois');
 }finally{if(id)await clean([id]);}
});

test('rejeita IDs inválidos, desconhecidos, duplicados e mais de três skills',async()=>{
 await assert.rejects(resolveSkills(['../etc']),/ID de skill inválido/);
 await assert.rejects(resolveSkills(['skill-inexistente']),/ENOENT|não encontrado/i);
 await assert.rejects(resolveSkills(['a','a']),/duplicados/);
 await assert.rejects(resolveSkills(['a','b','c','d']),/no máximo 3/);
 await assert.rejects(updateSkill('../x',input('x')),/ID de skill inválido/);
});

test('rejeita instruções vazias, front matter incompleto e conteúdo acima de 32 KiB',async()=>{
 await assert.rejects(createSkill(input(`${token} vazio`,'  ')),/não pode ficar vazio/);
 await assert.rejects(createSkill(input(`${token} yaml`,'---\ntitle: broken\n')),/Front matter Markdown incompleto/);
 await assert.rejects(createSkill(input(`${token} grande`,'x'.repeat(MAX_SKILL_BYTES+1))),/excede o limite/);
});

test('bloqueia symlink de skill e conteúdo adulterado',async()=>{
 const made:string[]=[];let linkId='';
 try{
  const s=await createSkill(input(`${token} Integridade`,'original'));made.push(s.id);
  await fs.writeFile(path.join(SKILLS_ROOT,s.id,'SKILL.md'),'tampered');
  await assert.rejects(resolveSkills([s.id]),/inválido ou alterado/);
  const outside=path.join(SKILLS_ROOT,`${token}-outside`);await fs.mkdir(outside,{recursive:true});
  linkId=`${token}-link`;await fs.symlink(outside,path.join(SKILLS_ROOT,linkId),'dir');
  await assert.rejects(resolveSkills([linkId]),/Link simbólico bloqueado/);
  await fs.rm(outside,{recursive:true,force:true});
 }finally{await clean([...made,...(linkId?[linkId]:[])]);}
});

test('aplica o limite agregado de 64 KiB nas skills selecionadas',async()=>{
 const ids:string[]=[];
 try{
  for(let i=0;i<3;i++){
   const s=await createSkill(input(`${token} aggregate ${i}`,'x'.repeat(24*1024)));ids.push(s.id);
  }
  await assert.rejects(resolveSkills(ids),/excedem 65536 bytes/);
 }finally{await clean(ids);}
});
