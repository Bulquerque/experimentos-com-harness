# v0.11 — Reliability & Environment

Esta versão não adiciona abas nem ferramentas. Preserva `orient`, `inspect`, `transform`, `execute`, `verify`, `preview`.

## Correções verificadas localmente

1. `node_syntax` também examina `.mjs`/`.cjs`, com regressões que criam arquivos sintaticamente inválidos.
2. `node_tests` e `python_tests` recusam resultados com zero testes, mesmo com exit code 0.
3. `compactHistory` mantém metadados estruturais sobre mudanças e verificadores, sem promover texto de arquivos/logs a instruções.
4. O loop interrompe três chamadas consecutivas idênticas que falham.
5. O runner não possui mais token interno padrão e rejeita operações sem token configurado.
6. Correção de tipo TypeScript no registro dos verificadores.

## O que NÃO está comprovado

- Conexão com uma conta NVIDIA real, custo e disponibilidade do modelo.
- Build/isolamento real Docker e execução real Lean/Mathlib neste ambiente.
- Build da interface React opcional (versão HTML/CSS/JS é a interface empacotada por padrão).
- Correção semântica universal de tarefas; `checks_passed` significa **somente** checagens técnicas pertinentes aprovadas.
- Segurança contra código deliberadamente malicioso: o runner tem restrições, mas o bind mount original ainda está presente no contêiner do executor.

## Executar

Windows: `./start.ps1` depois de abrir Docker Desktop. Linux/macOS: `./start.sh`.

Testes locais: `./check.ps1` ou `./check.sh`. Testes reais de destino: `./verify-installation.ps1` ou `./verify-installation.sh`.
