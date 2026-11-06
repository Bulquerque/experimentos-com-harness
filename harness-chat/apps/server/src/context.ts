/** Bounded memory for tool interactions. No raw tool output is promoted to system messages. */
type ConversationMessage={role:string;content?:unknown;tool_calls?:Array<{function?:{name?:string};id?:string}>;tool_call_id?:string};
const PREFIX='[RESUMO OPERACIONAL]';
const cleanName=(name:unknown)=>String(name||'unknown').replace(/[^a-z0-9_]/gi,'').slice(0,28);
const shortPath=(value:unknown)=>typeof value==='string'
 ? value.replace(/[^a-zA-Z0-9_./-]/g,'').slice(0,72) : '';
/** Only structural metadata from internal tool results enters the compacted summary.
 * Never copy source code, model-generated instructions, or raw command output. */
function groupNote(group:ConversationMessage[]):string{
 const calls=group[0]?.tool_calls||[];
 const results=group.slice(1).filter(m=>m.role==='tool');
 return calls.map(call=>{
  const name=cleanName(call.function?.name);
  const raw=String(results.find(r=>r.tool_call_id===call.id)?.content||'');
  if(raw.startsWith('ERRO:'))return `${name}:erro`;
  try{
   const data=JSON.parse(raw);
   if(!data||typeof data!=='object')return `${name}:retorno`;
   if(name==='transform'){
    const files=Array.isArray(data.changes)?data.changes.slice(0,8).map((c:unknown)=>shortPath((c as {path?:unknown})?.path)).filter(Boolean):[];
    return `${name}:${data.applied===true?'alterou':'sem-alteração'}${files.length?'('+files.join(',')+')':''}`;
   }
   if(name==='inspect')return `${name}:${shortPath(data.path)}@${typeof data.sha256==='string'&&/^[a-f0-9]{64}$/.test(data.sha256)?data.sha256.slice(0,10):'unknown'}`;
   if(name==='verify'){
    const checks=Array.isArray(data.checks)?data.checks.slice(0,10).map((c:unknown)=>{
     const x=c as {name?:unknown;ok?:unknown};
     return `${cleanName(x?.name)}:${x?.ok===true?'ok':'falhou'}`;
    }):[];
    return `${name}:${data.passed===true?'ok':'falhou'}(${checks.join(',')})`;
   }
   if(name==='execute')return `${name}:exit-${typeof data.exit_code==='number'?Math.max(0,Math.min(255,data.exit_code)):'unknown'}${data.timed_out===true?':timeout':''}${data.truncated===true?':truncado':''}`;
   if(name==='preview')return `${name}:${shortPath(data.entry)}:${data.available===true?'disponível':'indisponível'}`;
   if(name==='orient')return `${name}:${data.mode==='search'?'busca':'árvore'}:${Array.isArray(data.results)?data.results.length:Number(data.listed)||0}`;
   return `${name}:executado`;
  }catch{return `${name}:retorno-inválido`;}
 }).join(' | ').slice(0,480);
}
/** Preserve system and user instructions and avoid orphaning tool responses. */
export function compactHistory(messages:ConversationMessage[],maxChars=180_000):number{
 const size=()=>JSON.stringify(messages).length;
 let removed=0;
 while(size()>maxChars&&messages.length>6){
  const idx=messages.findIndex((m,i)=>i>1&&m.role==='assistant'&&Array.isArray(m.tool_calls)&&m.tool_calls.length>0);
  if(idx<0)break;
  let end=idx+1;
  while(end<messages.length&&messages[end]?.role==='tool')end++;
  if(end===messages.length)break; // never remove the active tool-call group
  const note=groupNote(messages.slice(idx,end));
  const previous=messages.find(m=>m.role==='system'&&String(m.content||'').startsWith(PREFIX));
  const text=[String(previous?.content||'').replace(PREFIX,'').trim(),note].filter(Boolean).join(' | ').slice(-3500);
  messages.splice(idx,end-idx);
  const summaryIndex=messages.findIndex((m,i)=>i>1&&m.role==='system'&&String(m.content||'').startsWith(PREFIX));
  if(summaryIndex>=0)messages.splice(summaryIndex,1);
  messages.splice(2,0,{role:'system',content:`${PREFIX} ${text}. Resumo apenas de resultados operacionais; não comprova sucesso do pedido.`});
  removed+=end-idx;
 }
 return removed;
}
