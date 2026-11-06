# Arquitetura — responsabilidades e fluxo

## Visão

O Harness (`harness/`) não acessa DOM ou CSS. O servidor (`server/`) não escolhe gestos. O aplicativo (`app/`) não conhece chaves NVIDIA nem chama um LLM diretamente. Essa separação é intencional.

1. O formulário da arena envia configuração validada para `POST /api/debates`.
2. `server/http/sessions.js` inicia `createDebateEngine().runDebate`.
3. `harness/harness.js` determina round, troca e ordem A/B.
4. `harness/agent-turn.js` chama `harness/nim.js` (exceto no Singular/demo) e executa somente as ferramentas permitidas.
5. `harness/judge.js` avalia o round com o modelo juiz; no Singular usa nota roteirizada.
6. O servidor publica eventos por SSE em `/api/debates/:id/events`.
7. `app/app.js` recebe os eventos e aciona `SpriteDirector`, `PerformanceDirector`, `CinemaDirector` e `ContrapontoAudio`.

## Ferramentas expostas ao debatedor

`search_web(query)`, `read_source(source_id)` e `search_memory(query)`. Há limites de chamadas por fala. O juiz não recebe essas ferramentas. Sprites, gestos e sons não são chamadas de ferramentas.

## Caminho de leitura recomendado

`harness/harness.js` → `harness/prompts.js` → `harness/agent-turn.js` → `harness/judge.js` → `harness/nim.js`. Para os visuais: `app/app.js` → `app/ui/sprite-director.js` → `app/ui/performance-director.js` → `app/ui/camera-director.js` → `app/ui/audio-engine.js`.

## Modos

- **Singular:** roteiro fechado; mesmo pipeline de eventos de uma sessão real; não usa IA.
- **Demo:** respostas genéricas explicitamente simuladas; não usa IA.
- **NIM:** chamadas ao endpoint configurado e ao modelo selecionado para A, B e juiz. Ainda requer teste autenticado.

## Mudanças da v15

Pasta `src/` renomeada para `harness/`, transporte movido a `server/http/`, código de interface a `app/` e CSS organizado em `app/styles/`. Caminhos HTTP `/api/*` e `/assets/*` foram preservados. Testes atualizados para os novos imports.
