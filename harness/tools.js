/* Ferramentas permitidas ao modelo: buscas sem execução de código.
 * Observação: o extrator HTTPS exige revisão adicional antes de expor em produção pública. */
import dns from 'node:dns/promises';
import net from 'node:net';

export const TOOL_DEFINITIONS = [
  { type: 'function', function: { name: 'search_web', description: 'Busque fontes externas para checar fatos. Retorne resultados com IDs de fonte.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Consulta de busca factual, específica, em poucas palavras' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'read_source', description: 'Leia o conteúdo de um resultado retornado por search_web; use o ID da fonte, não URLs arbitrárias.', parameters: { type: 'object', properties: { source_id: { type: 'string', description: 'ID retornado pela busca anterior' } }, required: ['source_id'] } } },
  { type: 'function', function: { name: 'search_memory', description: 'Pesquise trechos de documentos fornecidos ao debate. Cite IDs de trechos, sem inventar referências.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Assunto factual ou expressão a localizar no acervo' } }, required: ['query'] } } }
];

function ipIsPublic(ip) {
  const type = net.isIP(ip);
  if (!type) return false;
  if (type === 6) {
    const value = ip.toLowerCase();
    if (value.startsWith('::ffff:')) return ipIsPublic(value.split(':').slice(-1)[0]);
    return !(value === '::1' || value === '::' || value.startsWith('fe80:') || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('2001:db8:'));
  }
  const [a, b] = ip.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || b === 2)) || (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0));
}
async function assertSafeUrl(raw) {
  const u = new URL(raw);
  if (u.protocol !== 'https:' || u.username || u.password || u.port && u.port !== '443') throw new Error('Somente HTTPS público é permitido.');
  if (u.hostname === 'localhost' || u.hostname.endsWith('.local')) throw new Error('Host privado não permitido.');
  const ips = await dns.lookup(u.hostname, { all: true });
  if (!ips.length || ips.some(x => !ipIsPublic(x.address))) throw new Error('Endereço privado não permitido.');
  return u;
}
function htmlToText(content) {
  return content.replace(/<(script|style|noscript|svg|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').slice(0, 14000);
}
/** Retorna IDs efêmeros para que a IA não forneça URLs arbitrárias a readSource. */
export async function searchWeb(query, sourceMap) {
  if (!process.env.BRAVE_SEARCH_API_KEY) return { error: 'Pesquisa web desativada: configure BRAVE_SEARCH_API_KEY. O debate pode continuar usando a memória documental.' };
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', String(query).slice(0, 220)); url.searchParams.set('count', '5');
  const response = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { 'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY, Accept: 'application/json' } });
  if (!response.ok) return { error: `Busca indisponível (HTTP ${response.status})` };
  const results = (await response.json()).web?.results || [];
  return results.slice(0, 5).map((x) => {
    const sourceId = `WEB-${sourceMap.size + 1}`;
    sourceMap.set(sourceId, { url: x.url, title: x.title });
    return { sourceId, title: x.title, url: x.url, description: (x.description || '').slice(0, 450) };
  });
}
/** Lê apenas IDs registrados pela busca, HTTPS público, sem seguir redirects. */
export async function readSource(sourceId, sourceMap) {
  const entry = sourceMap.get(sourceId);
  if (!entry) return { error: 'ID de fonte desconhecido. Pesquise primeiro.' };
  try {
    await assertSafeUrl(entry.url);
    const res = await fetch(entry.url, { redirect: 'manual', signal: AbortSignal.timeout(9000), headers: { 'User-Agent': 'AIDebateArena/0.1 (Research prototype)', Accept: 'text/html,text/plain' } });
    if (!res.ok || (res.status >= 300 && res.status < 400)) return { sourceId, error: `Fonte indisponível (HTTP ${res.status}); redirecionamentos não são seguidos.` };
    const mime = res.headers.get('content-type') || '';
    if (!/(text\/html|text\/plain)/i.test(mime)) return { sourceId, error: 'A fonte não é uma página de texto HTML.' };
    const reader = res.body.getReader(); let size = 0; const buf = [];
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > 180000) { await reader.cancel(); break; }
      buf.push(value);
    }
    const text = htmlToText(Buffer.concat(buf).toString('utf8'));
    return { sourceId, title: entry.title, url: entry.url, text: text.slice(0, 10500) };
  } catch (err) { return { sourceId, error: `Não foi possível ler a fonte: ${err.message}` }; }
}
