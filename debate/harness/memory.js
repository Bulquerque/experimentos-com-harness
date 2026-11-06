/* RAG de uso local: JSON em disco + recuperação lexical ou embeddings NVIDIA.
 * Não representa um banco multiusuário para produção. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { embedTexts } from './nim.js';
import { MAX_DOC_TEXT } from './config.js';
const getStorePath = () => process.env.ARENA_DATA_PATH || path.join(process.cwd(), 'data', 'memory.json');

export function chunkText(text, size = 850, overlap = 140) {
  const source = text.replace(/\r\n/g, '\n').replace(/\s{3,}/g, '\n\n').trim();
  const out = [];
  for (let start = 0; start < source.length; start += size - overlap) {
    const value = source.slice(start, start + size);
    if (value.trim().length > 35) out.push(value);
    if (start + size >= source.length) break;
  }
  return out;
}
function tokens(text) {
  return (String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[a-z0-9]{3,}/g) || []);
}
function lexical(query, content) {
  const qt = [...new Set(tokens(query))]; const ct = tokens(content);
  if (!qt.length) return 0;
  const counts = new Map(); for (const x of ct) counts.set(x, (counts.get(x) || 0) + 1);
  return qt.reduce((score, x) => score + (counts.has(x) ? 1 + Math.log1p(counts.get(x)) : 0), 0) / Math.sqrt(ct.length + 10);
}
function cosine(a, b) {
  if (!a?.length || a.length !== b?.length) return 0;
  let xy = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { xy += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
  return xy / (Math.sqrt(aa * bb) || 1);
}
async function load() {
  try { const value = JSON.parse(await readFile(getStorePath(), 'utf8')); return { documents: value.documents || [], chunks: value.chunks || [] }; }
  catch (e) { if (e.code === 'ENOENT') return { documents: [], chunks: [] }; throw e; }
}
async function save(data) { const storePath = getStorePath(); await mkdir(path.dirname(storePath), { recursive: true }); await writeFile(storePath, JSON.stringify(data, null, 2)); }
const embeddingEnabled = () => process.env.RAG_USE_EMBEDDINGS === 'true' && !!process.env.NVIDIA_API_KEY;
/** Ingestão: normaliza texto, divide em blocos e (opcionalmente) gera embeddings. */
export async function ingestDocument({ name, text, scope = 'library' }) {
  if (!text?.trim()) throw new Error('Documento sem texto legível.');
  if (text.length > MAX_DOC_TEXT) throw new Error('Documento excede 150 mil caracteres.');
  const db = await load();
  const id = crypto.randomUUID(); const slices = chunkText(text);
  const doc = { id, name: String(name).slice(0, 120), scope, createdAt: new Date().toISOString(), chunks: slices.length, embeddings: embeddingEnabled() };
  const records = [];
  for (let i = 0; i < slices.length; i += 8) {
    const batch = slices.slice(i, i + 8);
    const embeddings = embeddingEnabled() ? await embedTexts(batch, 'passage') : batch.map(() => null);
    batch.forEach((content, j) => records.push({ id: `${id}:${i + j}`, documentId: id, name: doc.name, content, vector: embeddings[j] }));
  }
  db.documents.push(doc); db.chunks.push(...records); await save(db); return doc;
}
/** Recupera trechos por similaridade, sempre com um ID verificável. */
export async function searchMemory(query, { limit = 4, scope = 'library', documentIds = null } = {}) {
  const db = await load();
  const selected = Array.isArray(documentIds) ? new Set(documentIds) : null;
  const chunks = db.chunks.filter(c => (!selected || selected.has(c.documentId)) &&
    (scope === 'all' || db.documents.some(d => d.id === c.documentId && d.scope === scope)));
  if (!chunks.length) return [];
  let qvector = null;
  if (embeddingEnabled() && chunks.some(c => c.vector)) {
    try { [qvector] = await embedTexts([query], 'query'); } catch { /* fallback lexical */ }
  }
  return chunks.map(c => ({
    sourceId: c.id, document: c.name, text: c.content,
    score: qvector && c.vector ? cosine(qvector, c.vector) : lexical(query, c.content)
  })).filter(c => c.score > 0).sort((a, b) => b.score - a.score).slice(0, Math.min(Math.max(limit, 1), 8));
}
export async function listDocuments() { return (await load()).documents; }
export async function saveDebateMemory(debate) {
  const compact = `Tema: ${debate.config.topic}\n` + debate.turns.map(t => `${t.speaker} (${t.position}): ${t.speech}`).join('\n') +
    '\nAvaliação: ' + debate.judgments.map(j => `Round ${j.round}: A=${j.scoreA}, B=${j.scoreB}; ${j.reason}`).join('; ');
  return ingestDocument({ name: `Debate ${new Date().toISOString().slice(0, 10)} — ${debate.config.topic.slice(0, 45)}`, text: compact.slice(0, MAX_DOC_TEXT), scope: 'past-debates' });
}
export async function clearDocuments() { await save({ documents: [], chunks: [] }); }
export async function deleteDocument(id) {
  const db = await load(); const n = db.documents.length;
  db.documents = db.documents.filter(d => d.id !== id);
  db.chunks = db.chunks.filter(c => c.documentId !== id);
  await save(db); return db.documents.length !== n;
}

/** Dossiê rastreável: ao menos um trecho de CADA documento escolhido.
 * Em casos extensos, o LLM também pode recuperar outros trechos via search_memory.
 * Não confundir amostragem de contexto com leitura integral de milhares de páginas. */
export async function getCaseDossier(documentIds = []) {
  const ids = new Set(Array.isArray(documentIds) ? documentIds : []);
  if (!ids.size) return [];
  const db = await load();
  return db.documents.filter(d => ids.has(d.id) && d.scope === 'library').map(doc => {
    const chunks = db.chunks.filter(c => c.documentId === doc.id);
    return { id: doc.id, name: doc.name, totalChunks: chunks.length,
      chunks: chunks.slice(0, 3).map(c => ({ sourceId: c.id, excerpt: c.content.slice(0, 750) })) };
  });
}
