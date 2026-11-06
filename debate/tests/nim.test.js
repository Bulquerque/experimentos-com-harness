import test from 'node:test';import assert from 'node:assert/strict';
import { callNim, embedTexts } from '../harness/nim.js';
test('contrato de chat e embedding envia autorização e modos passage/query',async()=>{
 const original=globalThis.fetch;const key=process.env.NVIDIA_API_KEY;process.env.NVIDIA_API_KEY='fake-key-for-unit-test';
 const calls=[];
 try{
  globalThis.fetch=async (url,opts)=>{
   calls.push({url,opts,body:JSON.parse(opts.body)});
   if(url.endsWith('/chat/completions'))return new Response(JSON.stringify({choices:[{message:{role:'assistant',content:'{"speech":"Certo"}'}}]}),{status:200});
   return new Response(JSON.stringify({data:[{index:0,embedding:[0.3,0.4]},{index:1,embedding:[0.1,0.9]}]}),{status:200});
  };
  const res=await callNim({model:'modelo-teste',messages:[{role:'user',content:'Oi'}],tools:[]});
  assert.match(res.content,/Certo/);
  const vectors=await embedTexts(['primeiro','segundo'],'passage');assert.deepEqual(vectors,[[.3,.4],[.1,.9]]);
  assert.equal(calls[0].body.stream,false);assert.equal(calls[0].opts.headers.Authorization,'Bearer fake-key-for-unit-test');
  assert.equal(calls[1].body.input_type,'passage');assert.ok(calls[1].url.endsWith('/embeddings'));
 }finally{globalThis.fetch=original;if(key===undefined)delete process.env.NVIDIA_API_KEY;else process.env.NVIDIA_API_KEY=key;}
});
test('API sem credencial retorna erro explicativo',async()=>{const key=process.env.NVIDIA_API_KEY;delete process.env.NVIDIA_API_KEY;try{await assert.rejects(()=>callNim({model:'x',messages:[]}),/NVIDIA_API_KEY/);}finally{if(key!==undefined)process.env.NVIDIA_API_KEY=key;}});
