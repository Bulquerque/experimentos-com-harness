import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import {validateConfig} from '../harness/config.js';
import {createDebateEngine} from '../harness/harness.js';
import {caseVerdictMessages,judgeCase} from '../harness/court.js';
import {ingestDocument,getCaseDossier,searchMemory} from '../harness/memory.js';
import {readFileSync} from 'node:fs';

const base={topic:'Caso fictício da obra desaparecida',format:'court',rounds:2,exchanges:1,mode:'demo',
 agents:[{name:'Lia',position:'acusação',personality:'estrategista'},{name:'Dante',position:'defesa',personality:'provocador'}]};

test('Tribunal é distinto do debate, com ônus, documentos e duas partes',()=>{
 const c=validateConfig({...base,caseDocumentIds:['a'.repeat(36),'a'.repeat(36)]});
 assert.equal(c.format,'court');assert.equal(c.agents.length,2);
 assert.equal(c.caseDocumentIds.length,1);assert.equal(c.proofStandard,'alem_duvida_razoavel');
 assert.equal(validateConfig({...base,format:'debate'}).format,'debate');
});

test('Caso de demonstração não chama NVIDIA, juiz emite um único veredito',async()=>{
 let calls=0;const engine=createDebateEngine({chat:async()=>{calls++;throw Error('NIM chamado!');},delayMs:1});
 const events=[];const state=await engine.runDebate(base,{emit:(t,d)=>events.push(t)});
 assert.equal(state.status,'finished');assert.equal(calls,0);
 assert.equal(events.filter(x=>x==='turn').length,4);
 assert.equal(events.filter(x=>x==='case_verdict').length,1);
 assert.equal(events.filter(x=>x==='judgment').length,0);
 assert.equal(state.outcome.decision,'nao_comprovado');assert.equal(state.outcome.verdict.simulated,true);
});

test('RAG do caso não recupera documento de outro caso',async()=>{
 const prev=process.env.ARENA_DATA_PATH;const tmp=await mkdtemp(path.join(os.tmpdir(),'contraponto-court-'));
 try{
  process.env.ARENA_DATA_PATH=path.join(tmp,'db.json');
  const a=await ingestDocument({name:'Prova A.txt',text:'A credencial foi usada às vinte horas. A identificação pessoal não foi comprovada.'});
  const b=await ingestDocument({name:'Prova B.txt',text:'Documento de outro caso: credencial usada em outra cidade e outro prédio.'});
  const dossier=await getCaseDossier([a.id]);
  assert.deepEqual(dossier.map(d=>d.id),[a.id]);
  const found=await searchMemory('credencial usada',{documentIds:[a.id]});
  assert.ok(found.length);assert.ok(found.every(x=>x.sourceId.startsWith(a.id)));
  const result=await judgeCase({config:{...validateConfig({...base,mode:'nim',caseDocumentIds:[a.id]}),turnTimeoutSec:15},turns:[],
    chat:async()=>({content:JSON.stringify({decision:'nao_comprovado',reason:'Faltam evidências',findings:['Acesso registrado'],missingEvidence:['Identificação'],citations:[a.id+':0',b.id+':0','inventada']})})});
  assert.deepEqual(result.citations,[a.id+':0']);assert.equal(result.sourceCount,1);
 }finally{if(prev===undefined)delete process.env.ARENA_DATA_PATH;else process.env.ARENA_DATA_PATH=prev;await rm(tmp,{force:true,recursive:true});}
});

test('Juiz recebe contexto e padrão de prova, não instruções de condenação presumida',()=>{
 const prompt=caseVerdictMessages({config:validateConfig(base),turns:[],dossier:[]});
 assert.match(prompt[0].content,/ônus|padrão|inverta o ônus/);
 assert.match(prompt[0].content,/não|NÃO/);
});

test('Roteiro offline possui documento fictício, 16 falas e veredito distinto da pontuação',()=>{
 const fixture=JSON.parse(readFileSync(new URL('../offline/court-scenario.json',import.meta.url),'utf8'));
 assert.equal(fixture.preset.format,'court');assert.equal(fixture.turns.length,16);
 assert.equal(fixture.documents.length,3);assert.equal(fixture.verdict.simulated,true);
 assert.match(readFileSync(new URL('../offline/bridge.js',import.meta.url),'utf8'),/case_verdict/);
});
