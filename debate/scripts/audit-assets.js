/** Audita dependências visuais da versão executável, sem ferramentas externas. */
import { readFile, readdir, stat, access } from 'node:fs/promises';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const APP = path.join(ROOT, 'app');
const manifest = JSON.parse(await readFile(path.join(APP, 'assets/trio/manifest.json'), 'utf8'));
const used = new Set(Object.values(manifest.animations).flat().map(item => item.frame));
for (const character of manifest.layout) used.add(character.primary_sprite);
async function files(dir) {
  const out = [];
  for (const entry of await readdir(dir, {withFileTypes:true})) {
    const p=path.join(dir,entry.name);
    if(entry.isDirectory()) out.push(...await files(p));
    else out.push(p);
  }
  return out;
}
const frames = (await files(path.join(APP,'assets/trio/personagens')))
  .map(p=>path.relative(path.join(APP,'assets/trio'),p).split(path.sep).join('/'));
const orphan=frames.filter(p=>!used.has(p));
const missing=[...used].filter(p=>!frames.includes(p));
if(orphan.length || missing.length) throw new Error(`Sprites órfãos: ${orphan.join(',')} | ausentes: ${missing.join(',')}`);
if((await readdir(path.join(APP,'assets'))).includes('master'))throw new Error('Biblioteca duplicada antiga ainda presente.');
// CSS e HTML só podem referenciar recursos que de fato existem.
let checked=0;
for(const file of [...await files(path.join(APP,'styles')),path.join(APP,'index.html')]){
 const content=await readFile(file,'utf8');
 for(const [,url] of content.matchAll(/['"](\/assets\/[a-z0-9_./-]+\.(?:png|webp|svg|mp3|wav))['"]/gi)){
   await access(path.join(APP,url.slice(1)));checked++;
 }
}
for(const [name,sequence] of Object.entries(manifest.animations)) {
  if(!sequence.length || sequence.some(f=>!Number.isFinite(f.duration_ms) || f.duration_ms <=0))
    throw new Error('Sequência inválida: '+name);
}
const size = (await Promise.all(frames.map(p=>stat(path.join(APP,'assets/trio',p))))).reduce((a,f)=>a+f.size,0);
console.log(`AUDITORIA OK — ${Object.keys(manifest.animations).length} sequências; ${frames.length} sprites únicos; ${(size/1048576).toFixed(2)} MiB; ${checked} referências CSS/HTML verificadas; nenhum sprite órfão.`);
