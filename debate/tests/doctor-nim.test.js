import test from 'node:test';
import assert from 'node:assert/strict';
import { checkNim } from '../scripts/doctor-nim.js';

test('doctor: chave ausente falha sem consultar a rede', async () => {
 const logs=[]; const result=await checkNim({key:'',onLine:m=>logs.push(m),fetchImpl:()=>{throw Error('não deveria usar rede')}});
 assert.equal(result,false);assert.match(logs.join('\n'),/NVIDIA_API_KEY/);
});
test('doctor: catálogo sozinho não basta, inferência 403 reprova',async()=>{
 const logs=[];
 const fake=async(url, opts)=>({ok:!url.endsWith('/chat/completions'),status:403,async json(){return {data:[{id:'mock-a'},{id:'mock-b'},{id:'mock-judge'}]}}});
 const result=await checkNim({key:'INTERNAL-TEST-KEY',base:'http://127.0.0.1:1234/v1',ids:['mock-a','mock-b','mock-judge'],fetchImpl:fake,onLine:m=>logs.push(m)});
 assert.equal(result,false);assert.match(logs.join('\n'),/403|permissão/);
 assert.ok(!logs.join('\n').includes('INTERNAL-TEST-KEY'));
});
test('doctor: três modelos com JSON compatível são aprovados',async()=>{
 const logs=[];const called=[];
 const fake=async(url,opts)=>{
  if(url.endsWith('/models'))return {ok:true,async json(){return {data:[{id:'mock-a'},{id:'mock-b'},{id:'mock-judge'}]}}};
  const body=JSON.parse(opts.body);called.push(body.model); assert.equal(opts.headers.Authorization,'Bearer TEST-NIM-KEY');
  return {ok:true,async json(){return {choices:[{message:{content:JSON.stringify(body.model==='mock-judge'?{scoreA:8,scoreB:7,reason:'ok'}:{speech:'teste',action:'argument'})}}]}}};
 };
 const result=await checkNim({key:'TEST-NIM-KEY',base:'http://127.0.0.1:1234/v1',ids:['mock-a','mock-b','mock-judge'],fetchImpl:fake,onLine:m=>logs.push(m)});
 assert.equal(result,true);assert.deepEqual(called,['mock-a','mock-b','mock-judge']);assert.ok(!logs.join('\n').includes('TEST-NIM-KEY'));
});
