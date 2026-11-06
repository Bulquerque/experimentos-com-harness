/** NVIDIA-compatible chat adapter. Transport/retry are isolated from the agent loop. */
import type {Run} from './types.ts';
import {tools} from './tools.ts';
import {randomUUID} from 'node:crypto';

const MODEL_TIMEOUT_MS=90_000;
const RETRYABLE=new Set([429,500,502,503,504]);
const MAX_ATTEMPTS=3;
export async function requestModel(run:Run,key:string,baseUrl:string,messages:unknown[],onStatus:(title:string,detail:string)=>void,turn:number){
  const requestId=randomUUID();
  const trace={requestId,turn,attempts:[] as import('./types.ts').TraceAttempt[]};run.modelRequests.push(trace);
  const requestPayload={model:run.model,messages,temperature:0.2,max_tokens:4096,...(run.model==='z-ai/glm-5.3-flash'?{reasoning_effort:'low',clear_thinking:true}:{}),...(run.mode==='chat'?{}:{tools:tools.map(t=>({type:'function',function:t})),tool_choice:'auto'})};
  for(let attempt=1;attempt<=MAX_ATTEMPTS;attempt++){
    if(run.abort.signal.aborted)throw new Error('Execução cancelada');
    const record:import('./types.ts').TraceAttempt={attemptId:randomUUID(),startedAt:new Date().toISOString(),requestPayload:structuredClone(requestPayload)};trace.attempts.push(record);
    const signal=AbortSignal.any([run.abort.signal,AbortSignal.timeout(MODEL_TIMEOUT_MS)]);
    let res:Response;
    try{res=await fetch(`${baseUrl.replace(/\/$/,'')}/chat/completions`,{
      method:'POST',signal,headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
      body:JSON.stringify(requestPayload)
    });record.httpStatus=res.status;}catch(err){
      if(run.abort.signal.aborted)throw err;
      record.error=err instanceof Error?err.message:'Transport error';record.retryCategory='transport';record.finishedAt=new Date().toISOString();record.durationMs=Date.parse(record.finishedAt)-Date.parse(record.startedAt);
      if(attempt===MAX_ATTEMPTS)throw err;
      onStatus('Falha transitória da API',`Nova tentativa ${attempt+1}/${MAX_ATTEMPTS}`);
      await pause(run.abort.signal,attempt*600);continue;
    }
    const raw=(await res.text()).slice(0,2_000_000);
    if(res.ok){try{const data=JSON.parse(raw);const msg=data?.choices?.[0]?.message;record.response={requestId:data?.id,finishReason:data?.choices?.[0]?.finish_reason,usage:data?.usage,message:{content:typeof msg?.content==='string'?msg.content:null,tool_calls:safeVisibleToolCalls(msg?.tool_calls)}};record.finishedAt=new Date().toISOString();record.durationMs=Date.parse(record.finishedAt)-Date.parse(record.startedAt);return data;}catch{record.error='Resposta JSON inválida';record.finishedAt=new Date().toISOString();throw new Error('A API retornou JSON inválido');}}
    if(!RETRYABLE.has(res.status)||attempt===MAX_ATTEMPTS){record.error=`NVIDIA HTTP ${res.status}`;record.finishedAt=new Date().toISOString();throw new Error(`NVIDIA HTTP ${res.status}`);}
    record.retryCategory=`http_${res.status}`;record.finishedAt=new Date().toISOString();record.durationMs=Date.parse(record.finishedAt)-Date.parse(record.startedAt);
    onStatus(`NVIDIA HTTP ${res.status}`,`Repetindo chamada ${attempt+1}/${MAX_ATTEMPTS}`);
    const retryAfter=Number(res.headers.get('retry-after'));
    await pause(run.abort.signal,Number.isFinite(retryAfter)&&retryAfter>0?Math.min(retryAfter*1000,5000):attempt*800);
  }
  throw new Error('Orçamento de tentativas NVIDIA excedido');
}
function safeVisibleToolCalls(value:unknown){if(!Array.isArray(value))return [];return value.slice(0,64).map((call:any)=>({id:typeof call?.id==='string'?call.id:undefined,type:'function',function:{name:String(call?.function?.name||'').slice(0,128),arguments:String(call?.function?.arguments||'').slice(0,64_000)}}));}
function pause(signal:AbortSignal,ms:number){return new Promise<void>((resolve,reject)=>{
 const t=setTimeout(()=>{signal.removeEventListener('abort',onAbort);resolve();},ms);
 const onAbort=()=>{clearTimeout(t);reject(new Error('Execução cancelada'));};
 if(signal.aborted){clearTimeout(t);reject(new Error('Execução cancelada'));return;}
 signal.addEventListener('abort',onAbort,{once:true});
});}
