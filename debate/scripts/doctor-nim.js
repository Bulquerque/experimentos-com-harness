/** Diagnóstico autenticado do NVIDIA NIM, sem vazar a chave no navegador/log.
 * Executa chamadas pequenas aos modelos usados pelos agentes e pelo juiz.
 * A verificação usa créditos reais quando há chave válida. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODELS } from '../harness/config.js';
import { parseObject } from '../harness/response.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function loadLocalEnv() {
  let file;
  try { file = await readFile(path.join(root, '.env'), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  for (const line of file.split(/\r?\n/)) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return true;
}

// Os três papéis usam o mesmo modelo padrão, validado com os prompts do Harness.
const modelIds = () => [MODELS[0].id, MODELS[0].id, MODELS[0].id];
const baseUrl = () => (process.env.NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, '');
const shortError = status => ({
  400: 'Requisição incompatível com o modelo ou parâmetros.',
  401: 'Chave inválida ou expirada.',
  403: 'A chave/organização não tem permissão para inferência; confira Public API Endpoints.',
  404: 'ID do modelo não encontrado neste endpoint.',
  410: 'Modelo descontinuado ou indisponível.',
  429: 'Limite de requisições/créditos; tente novamente mais tarde.'
})[status] || `HTTP ${status}`;

export async function checkNim({ fetchImpl = fetch, onLine = console.log, ids = modelIds(), base = baseUrl(), key = process.env.NVIDIA_API_KEY } = {}) {
  if (!key || !key.trim() || /^(sua[-_ ]?chave|coloque|xxxx|YOUR_)/i.test(key.trim())) {
    onLine('FALHA: NVIDIA_API_KEY não foi definida. Copie .env.example para .env e preencha NVIDIA_API_KEY.');
    return false;
  }
  const auth = { Authorization: `Bearer ${key}`, Accept: 'application/json' };
  try {
    const catalog = await fetchImpl(`${base}/models`, { headers: auth, signal: AbortSignal.timeout(20000) });
    if (catalog.ok) {
      const data = await catalog.json();
      const names = new Set((data.data || []).map(x => x.id));
      onLine(`OK catálogo NVIDIA: ${names.size} modelos visíveis para esta chave.`);
      for (const model of ids) if (names.size && !names.has(model)) onLine(`AVISO: ${model} não aparece no catálogo da chave (tentando inferência mesmo assim).`);
    } else onLine(`AVISO: catálogo respondeu ${shortError(catalog.status)}; testando inferência diretamente.`);
  } catch (e) { onLine(`AVISO: não foi possível consultar o catálogo (${e.name || 'erro de conexão'}).`); }

  let pass = true;
  for (const [index, model] of ids.entries()) {
    const role = index === 2 ? 'juiz' : `debatedor ${index + 1}`;
    const schema = index === 2 ? '{"scoreA":8,"scoreB":7,"reason":"teste","feedbackA":"ok","feedbackB":"ok"}'
      : '{"speech":"Teste de conexão concluído.","emotion":"neutral","gesture":"idle","action":"argument","citations":[]}';
    try {
      const response = await fetchImpl(`${base}/chat/completions`, {
        method: 'POST', signal: AbortSignal.timeout(90000),
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [
          { role: 'system', content: `Teste técnico de compatibilidade. Responda SOMENTE com JSON válido, sem markdown. Formato: ${schema}` },
          { role: 'user', content: 'Retorne o JSON no formato pedido, com os mesmos campos.' }
        ], temperature: 0.2, max_tokens: 1000, stream: false })
      });
      if (!response.ok) { onLine(`FALHA ${role} (${model}): ${shortError(response.status)}`); pass = false; continue; }
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      const parsed = parseObject(content);
      const schemaOk = index === 2 ? parsed && Number.isFinite(Number(parsed.scoreA)) && Number.isFinite(Number(parsed.scoreB))
        : parsed && typeof parsed.speech === 'string' && parsed.speech.length > 0;
      if (!schemaOk) { onLine(`FALHA ${role} (${model}): respondeu, mas não forneceu o JSON esperado pelo harness.`); pass = false; }
      else onLine(`OK ${role} (${model}): inferência autenticada e JSON válido.`);
    } catch (e) { onLine(`FALHA ${role} (${model}): ${e.name === 'TimeoutError' ? 'timeout' : e.name || 'rede/resposta inválida'}.`); pass = false; }
  }
  onLine(pass ? 'PRONTO: os três modelos responderam no formato mínimo exigido. Faça um debate real curto para validar o fluxo completo.'
    : 'NÃO PRONTO: ajuste credencial/modelos antes de usar o debate real.');
  return pass;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await loadLocalEnv();
  console.log('Diagnóstico NVIDIA NIM — 3 pequenas inferências reais, que podem consumir créditos. A chave não será exibida.');
  const ok = await checkNim();
  if (!ok) process.exitCode = 1;
}
