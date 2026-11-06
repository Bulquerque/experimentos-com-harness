import test from 'node:test';
import assert from 'node:assert/strict';
import {serializeTrace} from './trace.ts';
import type {Run} from './types.ts';

function fixture():Run{return {id:'12345678-1234-1234-1234-123456789012',task:'Somar 2+2',model:'z-ai/glm-5.3-flash',history:[{role:'user',content:'anterior'}],mode:'agent',status:'running',startedAt:'2026-11-06T00:00:00.000Z',events:[],calls:1,usage:{prompt:15,completion:4},answer:'',verification:'none',abort:new AbortController(),participants:[{id:'harness-agent',kind:'agent',model:'z-ai/glm-5.3-flash',mode:'agent'}],skills:[{id:'math-review',name:'Revisão matemática',description:'Mostra cálculos',version:2,contentHash:'abc',instructions:'Etapas e unidades'}],modelRequests:[{requestId:'req-1',turn:1,attempts:[{attemptId:'attempt-1',startedAt:'2026-11-06T00:00:00Z',requestPayload:{model:'z-ai/glm-5.3-flash',messages:[{role:'system',content:'base + selected skill'}, {role:'user',content:'Somar 2+2'}],tools:[{type:'function',function:{name:'orient'}}]},response:{finishReason:'tool_calls',usage:{prompt_tokens:15},message:{content:null,tool_calls:[{id:'call-1',function:{name:'orient',arguments:'{"query":"math"}'}}]}}}]}],toolCalls:[{callId:'call-1',requestId:'req-1',turn:1,tool:'orient',argumentsRaw:'{"query":"math"}',arguments:{query:'math'},startedAt:'2026-11-06T00:00:01Z',finishedAt:'2026-11-06T00:00:02Z',durationMs:1000,status:'succeeded',result:'files',resultSentToModel:'files',resultBytes:5,sentBytes:5,truncated:false}]};}

test('v3 trace captures exact prompt, schemas, retries, tool results, skills and one real participant',()=>{
 const trace=serializeTrace(fixture()) as any;
 assert.equal(trace.schemaVersion,'3.0');assert.equal(trace.modelRequests[0].attempts[0].requestPayload.messages[1].content,'Somar 2+2');
 assert.equal(trace.modelRequests[0].attempts[0].requestPayload.tools[0].function.name,'orient');
 assert.equal(trace.toolCalls[0].callId,trace.modelRequests[0].attempts[0].response.message.tool_calls[0].id);
 assert.equal(trace.toolCalls[0].resultSentToModel,'files');assert.equal(trace.skills[0].version,2);assert.equal(trace.participants.length,1);
});
test('v3 trace omits private reasoning, credential-like and unknown run fields',()=>{
 const run:any=fixture();run.API_KEY='sentinel-key';run.reasoning='private-thought';run.providerResponse={analysis:'private'};
 run.modelRequests[0].attempts[0].requestPayload.authorization='Bearer secret';run.modelRequests[0].attempts[0].response.reasoning_content='secret reasoning';
 const json=JSON.stringify(serializeTrace(run));assert.equal(json.includes('sentinel-key'),false);assert.equal(json.includes('private-thought'),false);assert.equal(json.includes('secret reasoning'),false);assert.equal(json.includes('Bearer secret'),false);assert.equal(json.includes('providerResponse'),false);
});
