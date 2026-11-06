#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
echo '1/3 — Testes do agente e servidor'
node --disable-warning=ExperimentalWarning --experimental-strip-types --test --test-concurrency=1 apps/server/src/*.test.ts
echo '2/3 — Sintaxe da interface e contratos'
node --check apps/web/fallback/app.js
node --test qa/frontend-contract.test.mjs
echo '3/3 — Verificações locais concluídas'
echo 'PASS — Docker, NVIDIA e Lean reais dependem da configuração local e não são testados aqui.'
