import test from 'node:test';
import assert from 'node:assert/strict';
import {coverageFor,evidencePasses} from './assurance.ts';
import {checkWebAssets,checkWebScripts} from './runner.ts';
import {ROOT} from './workspace.ts';
import fs from 'node:fs/promises';
import path from 'node:path';

test('um teste Python aprovado não comprova alteração HTML',()=>{
 const c=coverageFor(['site/index.html'],['python_tests'],[],['site/index.html','tests/test_example.py']);
 assert.deepEqual(c.missing_checks,['web_assets','web_script_syntax']);assert.equal(evidencePasses(c),false);
});
test('cada linguagem demanda evidências pertinentes e falhas antigas não desaparecem',()=>{
 const files=['main.js','index.html','tests/test_math.py','solver.py','proofs/Proof.lean','package.json'];
 const c=coverageFor(['main.js','solver.py','proofs/Proof.lean'],['python_compile','python_tests','node_syntax','lean_core'],['node_tests'],files);
 assert.deepEqual(c.missing_checks,[]);assert.equal(evidencePasses(c),false);
 assert.equal(evidencePasses(coverageFor(['main.js'],['node_syntax'],[],files)),true);
});
test('arquivo somente de documentação não ganha aprovação automática a partir de testes sem relação',()=>{
 const c=coverageFor(['README.md'],['python_tests'],[],['README.md','tests/test_file.py']);
 assert.deepEqual(c.uncovered_files,['README.md']);assert.equal(evidencePasses(c),false);
});
test('verificador de HTML identifica referências inexistentes e aceita página íntegra',async()=>{
 const folder=`_assets-test-${process.pid}-${Date.now()}`;
 const dir=path.join(ROOT,folder);
 await fs.mkdir(dir,{recursive:true});
 try{
  await fs.writeFile(path.join(dir,'page.html'),'<html><body><link rel="stylesheet" href="main.css"><script src="main.js"></script></body></html>');
  await fs.writeFile(path.join(dir,'main.css'),'body {color:red}');
  let r=await checkWebAssets([`${folder}/page.html`]);assert.equal(r.ok,false);assert.match(r.output,/main.js/);
  await fs.writeFile(path.join(dir,'main.js'),'console.log("ok")');
  r=await checkWebAssets([`${folder}/page.html`]);assert.equal(r.ok,true,r.output);assert.match(r.output,/referências locais: 2/);
  await fs.writeFile(path.join(dir,'page.html'),'<html><body><script src="https://cdn.example/x.js"></script></body></html>');
  r=await checkWebAssets([`${folder}/page.html`]);assert.equal(r.ok,false);assert.match(r.output,/recurso externo/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('verificação web reprova JavaScript inválido mesmo quando HTML e referências existem',async()=>{
 const folder=`_webscript-test-${process.pid}-${Date.now()}`;
 const dir=path.join(ROOT,folder);
 await fs.mkdir(dir,{recursive:true});
 try{
  await fs.writeFile(path.join(dir,'index.html'),'<html><body><script src="main.js"></script><script>function broken( {</script></body></html>');
  await fs.writeFile(path.join(dir,'main.js'),'const ok = true;');
  const assets=await checkWebAssets([`${folder}/index.html`]);
  const scripts=await checkWebScripts([`${folder}/index.html`]);
  assert.equal(assets.ok,true,assets.output);
  assert.equal(scripts.ok,false,scripts.output);
  await fs.writeFile(path.join(dir,'index.html'),'<html><body><script src="main.js"></script><script>const ok = 1;</script></body></html>');
  const pass=await checkWebScripts([`${folder}/index.html`]);
  assert.equal(pass.ok,true,pass.output);
  await fs.writeFile(path.join(dir,'index.html'),'<html><body><script type="module">import { from "x"</script></body></html>');
  assert.equal((await checkWebScripts([`${folder}/index.html`])).ok,false);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
