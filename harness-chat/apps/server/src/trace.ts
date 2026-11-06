import type {Run} from './types.ts';

const MAX_TRACE_BYTES=16*1024*1024;
const MAX_FIELD_BYTES=12*1024*1024;
const PRIVATE_KEYS=/^(authorization|api[_-]?key|token|secret|password|analysis|reasoning|thinking|reasoning_content)$/i;
function clean(value:unknown,budget:{left:number}):unknown{
 if(value===null||typeof value==='boolean'||typeof value==='number')return value;
 if(typeof value==='string'){
  const bytes=Buffer.byteLength(value);const limit=Math.min(MAX_FIELD_BYTES,budget.left);
  if(bytes<=limit){budget.left-=bytes;return value;}
  const truncated=Buffer.from(value).subarray(0,Math.max(0,limit)).toString('utf8');budget.left=0;return truncated;
 }
 if(Array.isArray(value))return value.map(v=>clean(v,budget));
 if(value&&typeof value==='object'){
  const out:Record<string,unknown>={};
  for(const [key,v] of Object.entries(value as Record<string,unknown>)){
   if(PRIVATE_KEYS.test(key)||key.toLowerCase().includes('abort'))continue;
   if(budget.left<=0)break;out[key]=clean(v,budget);
  }
  return out;
 }
 return undefined;
}
export function serializeTrace(run:Run){
 const budget={left:MAX_TRACE_BYTES};
 const dto={schemaVersion:'3.0',generatedAt:new Date().toISOString(),sensitivity:{containsPrompts:true,mayContainWorkspaceContent:true,mayContainAttachedImageData:(run.attachments||[]).some(a=>a.mimeType.startsWith('image/')),containsCredentials:false,containsPrivateReasoning:false},run:{id:run.id,task:run.task,model:run.model,mode:run.mode||'agent',status:run.status,startedAt:run.startedAt,finishedAt:run.finishedAt,usage:run.usage,calls:run.calls,verification:run.verification,evidence:run.evidence,answer:run.answer},attachments:(run.attachments||[]).map(({id,name,mimeType,size,sha256,width,height,text})=>({id,name,mimeType,size,sha256,...(width?{width}:{}),...(height?{height}:{}),...(text!==undefined?{text}: {})})),artifacts:run.artifacts,participants:run.participants,skills:run.skills,modelRequests:run.modelRequests,toolCalls:run.toolCalls,events:run.events};
 const serialized=clean(dto,budget) as Record<string,unknown>;
 if(budget.left<=0)serialized.truncation={maxBytes:MAX_TRACE_BYTES,notice:'Trace atingiu o limite total; campos no fim podem estar ausentes ou truncados.'};
 return serialized;
}
