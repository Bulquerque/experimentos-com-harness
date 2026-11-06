import {createHash,randomUUID} from 'node:crypto';

export const ATTACHMENT_LIMITS={
  maxImages:8,maxImageBytes:4*1024*1024,maxAggregateImageBytes:8*1024*1024,
  maxTextFileBytes:256*1024,maxAggregateTextBytes:512*1024,
  maxDimension:32768,maxPixels:40_000_000,maxRequestBytes:12*1024*1024,
} as const;

export type AttachmentInput={id:string;name:string;mimeType:string;size:number;sha256:string;bytes?:Uint8Array;text?:string;width?:number;height?:number};
export type RawAttachment={name?:unknown;mimeType?:unknown;base64?:unknown;text?:unknown};
export class AttachmentValidationError extends Error { constructor(message:string){super(message);this.name='AttachmentValidationError';} }

const TEXT_TYPES:Record<string,string[]>={
  'text/plain':['.txt','.log'],'text/markdown':['.md','.markdown'],'text/csv':['.csv'],
  'application/json':['.json'],'text/javascript':['.js','.mjs','.cjs'],'application/typescript':['.ts','.tsx'],
  'text/html':['.html','.htm'],'text/css':['.css'],'text/xml':['.xml'],'application/xml':['.xml'],
  'text/x-python':['.py'],'text/x-java-source':['.java'],'text/x-c':['.c','.h'],'text/x-c++':['.cc','.cpp','.hpp'],
  'text/x-rust':['.rs'],'text/x-go':['.go'],'text/x-shellscript':['.sh','.bash'],'text/x-yaml':['.yaml','.yml'],
};
const IMAGE_TYPES=new Set(['image/png','image/jpeg','image/webp']);
const asBytes=(v:Uint8Array)=>Buffer.from(v.buffer,v.byteOffset,v.byteLength);
function fail(message:string):never{throw new AttachmentValidationError(message);}
function dimensions(bytes:Buffer,mime:string):{width:number;height:number}{
  if(mime==='image/png'){
    if(bytes.length<24||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.toString('ascii',12,16)!=='IHDR')fail('Arquivo PNG inválido ou truncado.');
    return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
  }
  if(mime==='image/jpeg'){
    if(bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8)fail('Arquivo JPEG inválido ou truncado.');
    let p=2;
    while(p<bytes.length){
      while(p<bytes.length&&bytes[p]!==0xff)p++;
      while(p<bytes.length&&bytes[p]===0xff)p++;
      if(p>=bytes.length)break;
      const marker=bytes[p++]!;
      if(marker===0xd9||marker===0xda)break;
      if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
      if(p+2>bytes.length)break;
      const length=bytes.readUInt16BE(p);
      if(length<2||p+length>bytes.length)fail('Segmento JPEG truncado.');
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
        if(length<7)fail('Dimensões JPEG inválidas.');
        return {height:bytes.readUInt16BE(p+3),width:bytes.readUInt16BE(p+5)};
      }
      p+=length;
    }
    fail('JPEG sem marcador de dimensões válido.');
  }
  if(bytes.length<12||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP')fail('Arquivo WebP inválido ou truncado.');
  const chunk=bytes.toString('ascii',12,16);
  if(chunk==='VP8X'){
    if(bytes.length<30)fail('Cabeçalho WebP VP8X truncado.');
    return {width:1+bytes.readUIntLE(24,3),height:1+bytes.readUIntLE(27,3)};
  }
  if(chunk==='VP8 '){
    if(bytes.length<30||bytes[23]!==0x9d||bytes[24]!==0x01||bytes[25]!==0x2a)fail('Quadro WebP VP8 inválido.');
    return {width:bytes.readUInt16LE(26)&0x3fff,height:bytes.readUInt16LE(28)&0x3fff};
  }
  if(chunk==='VP8L'){
    if(bytes.length<25||bytes[20]!==0x2f)fail('Quadro WebP VP8L inválido.');
    const b1=bytes[21]!,b2=bytes[22]!,b3=bytes[23]!,b4=bytes[24]!;
    return {width:1+(((b2&0x3f)<<8)|b1),height:1+(((b4&0x0f)<<10)|(b3<<2)|((b2&0xc0)>>6))};
  }
  fail('WebP sem quadro VP8, VP8L ou VP8X compatível.');
}
function decodeBase64(value:unknown):Buffer{
  if(typeof value!=='string'||!value.length||value.length>Math.ceil(ATTACHMENT_LIMITS.maxImageBytes/3)*4+4||value.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(value)||value.indexOf('=')>=0&&value.indexOf('=')<value.length-2)fail('Anexo de imagem precisa conter base64 válido e não exceder 4 MiB.');
  const bytes=Buffer.from(value,'base64');
  if(bytes.toString('base64')!==value)fail('Codificação base64 não canônica.');
  return bytes;
}
function checkedName(value:unknown):string{
  if(typeof value!=='string'||!value.trim()||value.length>180||/[\\/\0]/.test(value)||value==='.'||value==='..')fail('Nome de anexo inválido; informe somente um nome de arquivo, sem caminho.');
  return value.trim();
}

/** Validate an array of JSON attachment descriptors. Image descriptors use base64; textual descriptors use text. */
export async function validateAttachments(input:unknown,model:string):Promise<AttachmentInput[]>{
  if(input===undefined||input===null)return [];
  if(!Array.isArray(input))fail('Anexos devem ser enviados como uma lista.');
  const out:AttachmentInput[]=[];let images=0,imageBytes=0,textBytes=0;
  for(const raw of input){
    if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('Descritor de anexo inválido.');
    const item=raw as RawAttachment,name=checkedName(item.name),mime=typeof item.mimeType==='string'?item.mimeType.toLowerCase().split(';')[0]!.trim():'';
    if(IMAGE_TYPES.has(mime)){
      if(model!=='z-ai/glm-5.3-flash')fail(`O modelo ${model} não aceita anexos de imagem; selecione z-ai/glm-5.3-flash.`);
      if(item.text!==undefined)fail('Anexo de imagem deve usar o campo base64.');
      const bytes=decodeBase64(item.base64);
      if(bytes.length===0||bytes.length>ATTACHMENT_LIMITS.maxImageBytes)fail('Cada imagem deve ter no máximo 4 MiB.');
      const expected=mime==='image/png'?'.png':mime==='image/jpeg'?'.jpg':'.webp';
      const ext=name.toLowerCase().slice(name.lastIndexOf('.'));
      if(!(ext===expected||(mime==='image/jpeg'&&ext==='.jpeg')))fail('A extensão do nome não corresponde ao tipo MIME da imagem.');
      const {width,height}=dimensions(bytes,mime);
      if(!width||!height||width>ATTACHMENT_LIMITS.maxDimension||height>ATTACHMENT_LIMITS.maxDimension||width*height>ATTACHMENT_LIMITS.maxPixels)fail('Imagem excede o limite de dimensões (32.768 px por lado e 40 megapixels).');
      images++;imageBytes+=bytes.length;
      if(images>ATTACHMENT_LIMITS.maxImages)fail('São permitidas no máximo 8 imagens por solicitação.');
      if(imageBytes>ATTACHMENT_LIMITS.maxAggregateImageBytes)fail('As imagens excedem o limite agregado de 8 MiB.');
      out.push({id:randomUUID(),name,mimeType:mime,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:new Uint8Array(bytes),width,height});
    }else{
      if(item.base64!==undefined)fail('Anexos textuais devem usar o campo text.');
      const suffix=name.toLowerCase().slice(name.lastIndexOf('.'));
      if(!TEXT_TYPES[mime]?.includes(suffix))fail('Tipo de arquivo textual ou extensão não permitido.');
      if(typeof item.text!=='string')fail('Anexo textual precisa conter texto.');
      const bytes=Buffer.from(item.text,'utf8');
      if(bytes.length>ATTACHMENT_LIMITS.maxTextFileBytes)fail('Cada arquivo textual deve ter no máximo 256 KiB em UTF-8.');
      if(textBytes+bytes.length>ATTACHMENT_LIMITS.maxAggregateTextBytes)fail('Os anexos textuais excedem o limite agregado de 512 KiB.');
      if(bytes.includes(0))fail('Anexos textuais não podem conter bytes NUL.');
      textBytes+=bytes.length;
      out.push({id:randomUUID(),name,mimeType:mime,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),text:item.text});
    }
  }
  return out;
}

/** Reject an oversized JSON string by UTF-8 byte size before parsing or buffering further. */
export function parseBoundedJson(text:string,maxBytes=ATTACHMENT_LIMITS.maxRequestBytes):unknown{
  if(Buffer.byteLength(text,'utf8')>maxBytes)fail(`Corpo da solicitação excede o limite de ${maxBytes} bytes.`);
  try{return JSON.parse(text) as unknown;}catch{fail('Corpo JSON inválido.');}
}
