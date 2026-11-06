/** Recurso fornecido pelo usuário; áudio de Objeção toca no impacto sem alterar o Harness. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../', import.meta.url);
const text=async file => readFile(new URL(file,root),'utf8');

test('o MP3 original enviado está no projeto e o frontend preserva fallback e controle',async()=>{
  const sample=await readFile(new URL('app/assets/audio/objection-voice.mp3',root));
  assert.ok(sample.byteLength>3000);
  assert.equal(sample.toString('utf8',0,3),'ID3');
  const audio=await text('app/ui/audio-engine.js'),app=await text('app/app.js'),html=await text('app/index.html');
  assert.match(audio,/registerBundledCue\(name,url\)/);
  assert.match(audio,/this\.customCues\.get\(name\)/);
  assert.match(audio,/this\.bundledEnabled/);
  assert.match(audio,/const buffer=imported\?\.buffer\|\|included\?\.buffer/);
  assert.match(app,/registerBundledCue\('objection','\/assets\/audio\/objection-voice\.mp3'\)/);
  // Ordem de atributos HTML não afeta o comportamento de checkbox.
  assert.match(html,/<input\b(?=[^>]*\bid="use-objection-voice")(?=[^>]*\bchecked(?:\s|=|>))[^>]*>/);
  // Câmera toca áudio na transição de antecipação para gesto corporal.
  assert.match(await text('app/ui/camera-director.js'),/this\.audio\?\.cue\(action,\{side\}\)/);
});

test('o backend entrega o MP3 com MIME audio/mpeg',async()=>{
  const {createServer}=await import('../server/index.js');
  const server=createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const response=await fetch(`http://127.0.0.1:${server.address().port}/assets/audio/objection-voice.mp3`);
    assert.equal(response.status,200);
    assert.equal(response.headers.get('content-type'),'audio/mpeg');
    const responseBytes=Buffer.from(await response.arrayBuffer());
    const fileBytes=await readFile(new URL('app/assets/audio/objection-voice.mp3',root));
    assert.deepEqual(responseBytes,fileBytes);
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
});
