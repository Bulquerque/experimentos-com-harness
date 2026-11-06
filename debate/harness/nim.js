/** NVIDIA NIM: ÚNICO ponto de acesso ao provedor remoto.
 * Não existe LLM local; os testes substituem apenas a API por um mock HTTP.
 * Nunca importar este arquivo do frontend (a chave fica no servidor). */
const endpoint = () => (process.env.NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, '');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Retry limitado para falhas transitórias; outros erros são exibidos ao usuário. */
async function postJson(path, body, { signal } = {}) {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error('NVIDIA_API_KEY ausente. Configure o arquivo .env.');
  for (let attempt = 0; attempt < 3; attempt++) {
    let response;
    try {
      response = await fetch(`${endpoint()}${path}`, {
        method: 'POST', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(90000)]) : AbortSignal.timeout(90000),
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch (e) {
      if (attempt === 2 || signal?.aborted) throw e;
      await sleep(500 * (attempt + 1)); continue;
    }
    if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 2) {
      const retry = Number(response.headers.get('retry-after'));
      await response.body?.cancel();
      await sleep(Number.isFinite(retry) && retry > 0 ? Math.min(retry * 1000, 10000) : 800 * (attempt + 1));
      continue;
    }
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 240);
      throw new Error(`NIM ${response.status}: ${detail}`);
    }
    return response.json();
  }
  throw new Error('NIM indisponível após tentativas.');
}

/** Único adaptador ChatCompletions para debatedores e juiz. */
export async function callNim({ model, messages, tools, temperature = 0.65, maxTokens = 1300, signal }) {
  const payload = { model, messages, stream: false, temperature, max_tokens: maxTokens };
  if (tools?.length) { payload.tools = tools; payload.tool_choice = 'auto'; }
  const data = await postJson('/chat/completions', payload, { signal });
  const message = data?.choices?.[0]?.message;
  if (!message) throw new Error('NIM não retornou uma mensagem válida.');
  return message;
}

/** RAG: a NVIDIA distingue embeddings de passages e queries. */
export async function embedTexts(texts, inputType, signal) {
  if (!['query', 'passage'].includes(inputType)) throw new Error('inputType inválido');
  const model = process.env.NIM_EMBED_MODEL || 'nvidia/nemotron-3-embed-1b';
  const data = await postJson('/embeddings', {
    model, input: texts, input_type: inputType, encoding_format: 'float', truncate: 'END'
  }, { signal });
  if (!Array.isArray(data?.data) || data.data.length !== texts.length) throw new Error('Resposta inválida do endpoint de embeddings.');
  return [...data.data].sort((a, b) => a.index - b.index).map(x => x.embedding);
}
