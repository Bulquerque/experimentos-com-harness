import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { json, readBody, extractPdf, servePublic } from './http/transport.js';
import { createSessionStore } from './http/sessions.js';
import { createDebateEngine } from '../harness/harness.js';
import { MODELS, MAX_DOC_BYTES, validateConfig } from '../harness/config.js';
import { SINGULAR_PRESET } from '../harness/singular.js';
import { ingestDocument, listDocuments, deleteDocument, searchMemory, getCaseDossier } from '../harness/memory.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function loadEnv() {
  try {
    const lines = (await readFile(path.join(root, '.env'), 'utf8')).split(/\r?\n/);
    for (const line of lines) {
      const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
}
await loadEnv();
const harness = createDebateEngine();
const sessions = createSessionStore(harness);
const safeError = error => String(error?.message || error).slice(0, 450);

/** API HTTP: configura sessões e documentos; inteligência fica em harness/. */
export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost'); const route = url.pathname;
      // Roteiro e configurações consumidos pela página.
      if (req.method === 'GET' && route === '/api/scenarios/singular') return json(res, 200, { preset: SINGULAR_PRESET });
      if (req.method === 'GET' && route === '/api/config') return json(res, 200, {
        models: MODELS, hasNimKey: !!process.env.NVIDIA_API_KEY, hasWebSearch: !!process.env.BRAVE_SEARCH_API_KEY,
        ragEmbeddings: process.env.RAG_USE_EMBEDDINGS === 'true' && !!process.env.NVIDIA_API_KEY
      });
      // Biblioteca RAG: upload, listagem, exclusão e pesquisa.
      if (req.method === 'GET' && route === '/api/documents') return json(res, 200, { documents: await listDocuments() });
      if (req.method === 'POST' && route === '/api/documents') {
        const name = decodeURIComponent(String(req.headers['x-filename'] || 'Documento')).replace(/[\\/]/g, '_').slice(0, 120);
        const raw = await readBody(req, MAX_DOC_BYTES); const pdf = name.toLowerCase().endsWith('.pdf');
        if (!/\.(pdf|md|txt)$/i.test(name)) return json(res, 415, { error: 'Apenas PDF, Markdown e TXT.' });
        if (pdf && raw.subarray(0, 5).toString() !== '%PDF-') return json(res, 400, { error: 'Arquivo não parece um PDF válido.' });
        const text = pdf ? await extractPdf(raw, root) : raw.toString('utf8');
        const document = await ingestDocument({ name, text });
        return json(res, 201, { document });
      }
      if (req.method === 'DELETE' && route.startsWith('/api/documents/')) {
        const removed = await deleteDocument(route.split('/').at(-1));
        return json(res, removed ? 200 : 404, { removed });
      }
      if (req.method === 'POST' && route === '/api/search-memory') {
        const { query } = JSON.parse((await readBody(req)).toString('utf8'));
        return json(res, 200, { results: await searchMemory(String(query || '').slice(0, 200)) });
      }
      // Debate: cria sessão e permite acompanhar eventos por SSE.
      if (req.method === 'POST' && route === '/api/debates') {
        const config = validateConfig(JSON.parse((await readBody(req)).toString('utf8')));
        if (config.format === 'court' && config.mode === 'nim') {
          const existing = await getCaseDossier(config.caseDocumentIds);
          if (!existing.length || existing.length !== config.caseDocumentIds.length)
            return json(res, 400, { error: 'Selecione pelo menos um documento válido da biblioteca para o processo.' });
        }
        if (config.mode === 'nim' && !process.env.NVIDIA_API_KEY) return json(res, 400, { error: 'Configure NVIDIA_API_KEY no backend para usar modelos reais.' });
        return json(res, 201, { id: sessions.create(config), config });
      }
      const match = /^\/api\/debates\/([0-9a-f-]+)(?:\/(events|control|evidence))?$/.exec(route);
      if (match) {
        const s = sessions.get(match[1]); if (!s) return json(res, 404, { error: 'Sessão não encontrada.' });
        if (req.method === 'GET' && match[2] === 'events') {
          res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
          for (const event of s.history) res.write(`data: ${JSON.stringify(event)}\n\n`);
          if (s.done) return res.end();
          s.clients.add(res);
          req.on('close', () => s.clients.delete(res)); return;
        }
        if (req.method === 'POST' && match[2] === 'evidence') {
          const { documentId } = JSON.parse((await readBody(req)).toString('utf8'));
          const released = sessions.releaseEvidence(s, String(documentId || ''));
          return json(res, 200, { released, releasedIds: s.evidence.releasedIds });
        }
        if (req.method === 'POST' && match[2] === 'control') {
          const { action } = JSON.parse((await readBody(req)).toString('utf8'));
          if (action === 'pause') s.paused = true;
          else if (action === 'resume') s.paused = false;
          else if (action === 'cancel') { s.paused = false; s.controller.abort(); }
          else if (action === 'advance') return json(res, 200, { ...sessions.advance(s), status: 'running' });
          else return json(res, 400, { error: 'Ação desconhecida.' });
          return json(res, 200, { status: s.done ? 'done' : s.paused ? 'paused' : 'running' });
        }
        if (req.method === 'GET' && !match[2]) return json(res, 200, { id: s.id, done: s.done, state: s.state, events: s.history });
      }
      if (route.startsWith('/api/')) return json(res, 404, { error: 'Rota não encontrada.' });
      if (req.method === 'GET' || req.method === 'HEAD') return servePublic(req, res, route, root);
      return json(res, 405, { error: 'Método não permitido.' });
    } catch (err) { json(res, 400, { error: safeError(err) }); }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  createServer().listen(port, '127.0.0.1', () => console.log(`\n✦ Arena em http://localhost:${port}\n`));
}
