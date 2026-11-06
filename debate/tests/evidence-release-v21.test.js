import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCourtEvidence } from '../harness/court-evidence.js';
import { validateConfig } from '../harness/config.js';
import { createDebateEngine } from '../harness/harness.js';
import { debaterMessages } from '../harness/prompts.js';
import { caseVerdictMessages } from '../harness/court.js';

const ID1='1'.repeat(36), ID2='2'.repeat(36), ID3='3'.repeat(36);
const base={topic:'Caso fictício do museu Aurora',format:'court',mode:'nim',rounds:2,exchanges:1,
  agents:[{name:'Lia',model:'modelo-promotora'},{name:'Dante',model:'modelo-defesa'}],
  caseDocumentIds:[ID1,ID2],caseEvidencePlan:[{documentId:ID1,releaseRound:1},{documentId:ID2,releaseRound:2}],judgeModel:'juiz'};

test('plano progressivo contém só documentos do caso e sessões válidas',()=>{
 const c=validateConfig({...base,caseEvidencePlan:[{documentId:ID2,releaseRound:7},{documentId:ID3,releaseRound:1}]});
 assert.deepEqual(c.caseEvidencePlan,[{documentId:ID1,releaseRound:1},{documentId:ID2,releaseRound:2}]);
 assert.equal(c.winner,undefined);
});
test('prova futura não aparece em prompts nem RAG de sessão anterior',async()=>{
 const c=validateConfig(base),events=[],searches=[];
 let access=null;
 const chat=async req=>{
  if(req.model==='juiz')throw Error('juiz mock não deveria ser chamado pelo adaptador');
  if(!req.messages.some(m=>m.role==='tool'))return {content:null,tool_calls:[{id:'t'+searches.length,type:'function',function:{name:'search_memory',arguments:JSON.stringify({query:'registro ou câmera'})}}]};
  return {content:JSON.stringify({speech:'Fala simulada, sem citação inventada.',emotion:'thinking',gesture:'idle',action:'argument',citations:[]})};
 };
 const engine=createDebateEngine({chat,delayMs:0,memorySearch:async (q,opts)=>{searches.push(opts.documentIds);return[];},caseJudge:async({evidence})=>{
  access=evidence;return{decision:'indeterminado',reason:'Sem dados analisados',simulated:true};}});
 const st=await engine.runDebate(c,{emit:(type,data)=>events.push({type,data})});
 assert.equal(st.status,'finished');
 assert.equal(searches.length,4);
 assert.deepEqual(searches[0],[ID1]);assert.deepEqual(searches[1],[ID1]);
 assert.deepEqual(searches[2],[ID1,ID2]);assert.deepEqual(searches[3],[ID1,ID2]);
 assert.deepEqual(events.filter(x=>x.type==='evidence_released').map(x=>x.data.documentId),[ID1,ID2]);
 assert.ok(events.findIndex(x=>x.type==='evidence_released'&&x.data.documentId===ID2) > events.findIndex(x=>x.type==='turn'));
 assert.deepEqual(access.history.map(x=>x.round),[1,2]);
});
test('liberação manual não aceita documento externo e não duplica eventos',()=>{
 const seen=[];const state=createCourtEvidence(validateConfig(base),(t,d)=>seen.push({t,d}));
 state.beginRound(1);assert.deepEqual(state.releasedIds,[ID1]);
 assert.throws(()=>state.release(ID3),/não pertence/);
 assert.equal(state.release(ID2,{reason:'manual'}),true);
 assert.equal(state.release(ID2),false);state.beginRound(2);
 assert.deepEqual(state.releasedIds,[ID1,ID2]);assert.equal(seen.length,2);
 assert.equal(state.history[1].reason,'manual');
});
test('modelos recebem somente IDs liberados; juiz recebe timeline sem escolher vencedor',()=>{
 const c=validateConfig(base);const evidence=createCourtEvidence(c);evidence.beginRound(1);
 const messages=debaterMessages({config:c,agent:c.agents[0],turns:[],judgments:[],round:1,exchange:1,evidence});
 const context=JSON.parse(messages[1].content);
 assert.deepEqual(context.courtCase.evidenceIds,[ID1]);assert.ok(!JSON.stringify(context).includes(ID2));
 const judge=caseVerdictMessages({config:c,turns:[],dossier:[],evidenceTimeline:evidence.history});
 assert.match(judge[1].content,/evidenceTimeline/);
 assert.doesNotMatch(judge[1].content,/desiredWinner/);
});
test('roteiro offline inclui revelações por sessão e respeita ordem das falas',()=>{
 const f=JSON.parse(readFileSync(new URL('../offline/court-scenario.json',import.meta.url)));
 assert.deepEqual(f.preset.caseEvidencePlan.map(x=>x.releaseRound),[1,2,3]);
 const released=new Set();for(let round=1;round<=4;round++){
  for(const x of f.preset.caseEvidencePlan.filter(x=>x.releaseRound===round))released.add(x.documentId);
  for(const t of f.turns.filter(t=>t.round===round))for(const src of t.citations)assert.ok(released.has(src),`${src} citado antes da sessão ${round}`);
 }
 const bridge=readFileSync(new URL('../offline/bridge.js',import.meta.url),'utf8');
 assert.match(bridge,/evidence_released/);
});

test('endpoint HTTP libera apenas prova anexada, registra SSE e rejeita prova externa',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises');
 const os=await import('node:os');const path=await import('node:path');
 const {ingestDocument}=await import('../harness/memory.js');
 const {createServer}=await import('../server/index.js');
 const prev=process.env.ARENA_DATA_PATH;
 const tmp=await mkdtemp(path.join(os.default.tmpdir(),'contraponto-v21-http-'));
 let server;
 try{
  process.env.ARENA_DATA_PATH=path.join(tmp,'store.json');
  const a=await ingestDocument({name:'Inicial.txt',text:'O registro de entrada mostra o uso da credencial no museu às dezenove horas.'});
  const b=await ingestDocument({name:'Laudo Novo.txt',text:'Uma perícia adicional contesta a identificação da pessoa na imagem de segurança.'});
  server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}`;
  const config={...base,mode:'demo',rounds:2,exchanges:1,caseDocumentIds:[a.id,b.id],caseEvidencePlan:[{documentId:a.id,releaseRound:1},{documentId:b.id,releaseRound:2}]};
  const res=await fetch(url+'/api/debates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(config)});
  assert.equal(res.status,201);const data=await res.json();
  const route=`${url}/api/debates/${data.id}/evidence`;
  const bad=await fetch(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({documentId:ID3})});
  assert.equal(bad.status,400);
  const ok=await fetch(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({documentId:b.id})});
  assert.equal(ok.status,200);assert.equal((await ok.json()).released,true);
  const duplicate=await fetch(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({documentId:b.id})});
  assert.equal((await duplicate.json()).released,false);
  const history=await (await fetch(`${url}/api/debates/${data.id}`)).json();
  const release=history.events.filter(e=>e.type==='evidence_released');
  assert.equal(release.filter(x=>x.data.documentId===b.id).length,1);
  const cancel=await fetch(`${url}/api/debates/${data.id}/control`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'cancel'})});
  assert.equal(cancel.status,200);
 }finally{if(server)await new Promise(resolve=>server.close(resolve));
  if(prev===undefined)delete process.env.ARENA_DATA_PATH;else process.env.ARENA_DATA_PATH=prev;
  await rm(tmp,{recursive:true,force:true});}
});
