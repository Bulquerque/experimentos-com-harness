# Handoff para Codex — Contraponto v15

## Para começar

1. Extraia o pacote e abra a pasta raiz.
2. Execute `npm run check`, `npm test`, `npm run audit:assets` e `npm start`.
3. Verifique a interface no navegador e rode `npm run test:ui` se Python/Playwright/Chromium estiverem instalados.
4. Para NVIDIA real: copie `.env.example` para `.env`, informe `NVIDIA_API_KEY` e teste primeiro **1 round / 1 troca** com ferramentas desabilitadas; depois habilite RAG e busca.

## Onde alterar

- Prompts: `harness/prompts.js`
- Regras e trocas: `harness/harness.js`
- Ferramentas e seus limites: `harness/tools.js` + `harness/agent-turn.js`
- Juiz: `harness/judge.js`
- Modelos NVIDIA: `harness/config.js` + `harness/nim.js`
- Animações: `app/ui/sprite-director.js` e `app/assets/trio/manifest.json`
- Câmera: `app/ui/camera-director.js` + `app/styles/camera.css`
- Áudio: `app/ui/audio-engine.js` + `app/styles/audio.css`
- Interação e edição de debates: `app/app.js` + `app/ui/configuration.js`

## O que ainda não foi validado

Modelos reais NVIDIA NIM; rate limits e disponibilidade da conta; coerência de longos debates; screenshots em hardware Android real; eventual publicação em escala e controle multiusuário; direitos de distribuição da gravação Objection!. Não declarar esses pontos como testados.

## Não reintroduzir

`assets/master/`, pastas `src/` e `public/` antigas, experimentos de sprites sem referência ou dependência de outro provedor/LLM local não solicitada.
