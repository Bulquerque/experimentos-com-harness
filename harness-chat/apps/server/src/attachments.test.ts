import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AttachmentValidationError,ATTACHMENT_LIMITS,parseBoundedJson,validateAttachments} from './attachments.ts';

const model='z-ai/glm-5.3-flash';
function png(w=2,h=3){const b=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.write('IHDR',12);b.writeUInt32BE(w,16);b.writeUInt32BE(h,20);return b;}
function jpeg(w=2,h=3){const b=Buffer.alloc(15);b.set([0xff,0xd8,0xff,0xc0,0,11,8]);b.writeUInt16BE(h,7);b.writeUInt16BE(w,9);b.set([1,1,0x11,0],11);return b;}
function webp(chunk:'VP8X'|'VP8L'|'VP8 ',w=2,h=3){const b=Buffer.alloc(chunk==='VP8X'?30:chunk==='VP8L'?25:30);b.write('RIFF');b.write('WEBP',8);b.write(chunk,12);if(chunk==='VP8X'){b.writeUIntLE(w-1,24,3);b.writeUIntLE(h-1,27,3);}else if(chunk==='VP8L'){const wm=w-1,hm=h-1;b[20]=0x2f;b[21]=wm&255;b[22]=((wm>>8)&0x3f)|((hm&3)<<6);b[23]=(hm>>2)&255;b[24]=(hm>>10)&0x0f;}else{b[23]=0x9d;b[24]=1;b[25]=0x2a;b.writeUInt16LE(w,26);b.writeUInt16LE(h,28);}return b;}
const image=(bytes:Buffer,mime:string,name:string)=>({name,mimeType:mime,base64:bytes.toString('base64')});
async function rejects(input:unknown,expected:RegExp,whichModel=model){await assert.rejects(validateAttachments(input,whichModel),e=>e instanceof AttachmentValidationError&&expected.test(e.message));}

test('accepts PNG, JPEG and all supported WebP dimension headers with hashes and server IDs',async()=>{
  for(const [bytes,mime,name,dimensions] of [[png(),'image/png','a.png',[2,3]],[jpeg(),'image/jpeg','a.jpeg',[2,3]],[webp('VP8X'),'image/webp','a.webp',[2,3]],[webp('VP8L'),'image/webp','a.webp',[2,3]],[webp('VP8 '),'image/webp','a.webp',[2,3]]] as const){
    const [result]=await validateAttachments([image(bytes,mime,name)],model);
    assert.equal(result?.width,dimensions[0]);assert.equal(result?.height,dimensions[1]);assert.match(result?.sha256??'',/^[a-f0-9]{64}$/);assert.ok(result?.id);assert.equal(result?.size,bytes.length);
  }
});

test('rejects spoofed MIME, malformed base64, unsupported model and path-like names',async()=>{
  await rejects([image(jpeg(),'image/png','x.png')],/PNG inválido/);
  await rejects([{name:'x.png',mimeType:'image/png',base64:'%%%'}],/base64 válido/);
  await rejects([image(png(),'image/png','../x.png')],/sem caminho/);
  await rejects([image(png(),'image/png','x.png')],/não aceita anexos de imagem/,'other/model');
});

test('enforces image count, per-file bytes, aggregate bytes and image dimensions/pixels',async()=>{
  await rejects(Array.from({length:9},(_,i)=>image(png(), 'image/png',`${i}.png`)),/no máximo 8/);
  await rejects([image(Buffer.alloc(ATTACHMENT_LIMITS.maxImageBytes+1),'image/png','big.png')],/4 MiB/);
  const perImage=Buffer.alloc(3*1024*1024);png().copy(perImage);await rejects([image(perImage,'image/png','a.png'),image(perImage,'image/png','b.png'),image(perImage,'image/png','c.png')],/agregado de 8 MiB/);
  await rejects([image(png(32769,1),'image/png','wide.png')],/dimensões/);
  await rejects([image(png(6325,6325),'image/png','pixels.png')],/40 megapixels/);
});

test('accepts bounded UTF-8 text attachments and rejects mismatched or oversized files',async()=>{
  const [ok]=await validateAttachments([{name:'notes.md',mimeType:'text/markdown',text:'ação'}],model);
  assert.equal(ok?.size,Buffer.byteLength('ação'));assert.equal(ok?.text,'ação');
  await rejects([{name:'notes.md',mimeType:'application/json',text:'{}'}],/extensão não permitido/);
  await rejects([{name:'notes.md',mimeType:'text/markdown',text:'x'.repeat(ATTACHMENT_LIMITS.maxTextFileBytes+1)}],/256 KiB/);
  await rejects([{name:'a.txt',mimeType:'text/plain',text:'x'.repeat(262144)},{name:'b.txt',mimeType:'text/plain',text:'x'.repeat(262144)},{name:'c.txt',mimeType:'text/plain',text:'x'}],/agregado de 512 KiB/);
  await rejects([{name:'a.txt',mimeType:'text/plain',text:'a\0b'}],/NUL/);
});

test('checks JSON request size in UTF-8 bytes and parses valid JSON',()=>{
  assert.deepEqual(parseBoundedJson('{"ok":true}'),{ok:true});
  assert.throws(()=>parseBoundedJson('"é"',3),/excede o limite/);
  assert.throws(()=>parseBoundedJson('{'),/JSON inválido/);
});
