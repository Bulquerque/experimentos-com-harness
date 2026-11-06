# Relatório de testes — Harness Chat 1.0

Data: 2026-11-05

| Escopo | Resultado |
|---|---|
| Node (agente, runner, HTTP, Lean policy, segurança, contexto, revisões) | 44/44 testes aprovados |
| UI (contratos, sintaxe, ausência de interpolação HTML de saídas) | 3/3 aprovados |
| Python (exemplos numéricos/reprodutibilidade) | 6/6 aprovados |
| HTTP E2E com provedor NVIDIA simulado (histórico, modelo, resposta, rejeição de role privilegiado) | Aprovado |
| JavaScript frontend `node --check` | Aprovado |
| TypeScript strict `npm run typecheck` | Não executado até o fim: faltam dependências de tipos Node no ambiente offline |
| Navegador real (Playwright Chromium) | Não executado: acesso ao loopback bloqueado pelo ambiente do navegador |
| NVIDIA NIM autenticado, executor Docker, Lean 4 real e Mathlib | Não executados neste ambiente |

**Limites:** testes unitários de Lean usam runner simulado; não equivalem a compilação formal real. Os checks não demonstram que qualquer solicitação de usuário foi totalmente atendida.
