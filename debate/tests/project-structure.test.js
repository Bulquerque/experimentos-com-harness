import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat,access} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from '../server/index.js';
const root=path.resolve(import.meta.dirname,'..');
const read=rel=>readFile(path.join(root,rel),'utf8');

test('Separação clara entre Harness, servidor e interface', async()=>{
 for(const file of ['harness/harness.js','harness/nim.js','harness/prompts.js','harness/judge.js','harness/memory.js','server/index.js','app/app.js','app/ui/sprite-director.js','app/ui/audio-engine.js','app/ui/camera-director.js','app/catalog.html'])
  assert.ok((await stat(path.join(root,file))).size > 100, file);
 const harness=await read('harness/harness.js');
 assert.doesNotMatch(harness,/document\.|window\.|querySelector|\.png|\.css|createElement/);
 const sprite=await read('app/ui/sprite-director.js');
 assert.doesNotMatch(sprite,/NVIDIA_API_KEY|\bcallNim\b/);
});

test('HTML referencia somente folhas e scripts existentes', async()=>{
 const html=await read('app/index.html');
 for(const [,file] of html.matchAll(/(?:src|href)="(\/(?:styles|ui|assets)\/[^"?]+\.(?:js|css|png|webp|mp3))"/g))
   await access(path.join(root,'app',file.slice(1)));
 assert.match(html,/\/catalog\.html/);
});

test('Catálogo e CSS são servidos pela mesma aplicação sem public/src legados', async()=>{
 const app=createServer();await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${app.address().port}`;
 try {
  for(const [file,mime] of [['/catalog.html','text/html'],['/styles/base.css','text/css'],['/ui/audio-engine.js','text/javascript'],['/assets/trio/manifest.json','application/json']]){
   const res=await fetch(url+file); assert.equal(res.status,200,file);assert.ok(res.headers.get('content-type').includes(mime),file);
  }
  for(const file of ['/assets/master/manifest.json','/src/harness.js','/public/app.js'])
   assert.equal((await fetch(url+file)).status,404,file);
 }finally {await new Promise(resolve=>app.close(resolve));}
});
