# Harness Chat 1.0 — notas de migração

- Origem: NVIDIA Harness Studio v0.11 Reliability, não a versão menor.
- Preservado: executor Docker, Lean/Mathlib, ferramentas originais, verificações, hash, revisões, SSE, API e testes.
- Novo: conversa em múltiplos turnos; histórico limitado e validado; modo Chat sem ferramentas; modo Agente com ferramenta automática; interface única sem React/Vite; histórico local da UI.
- Removido: frontend React opcional e documentos visuais desatualizados; interface reduzida a HTML, CSS e JS estáticos.
- Sem integração NVIDIA em ambiente de teste, nunca declarar execução de LLM, Docker ou Lean validada.
- Fluxo canônico: navegador -> /api/runs com history -> agent -> model -> ferramentas no runner -> SSE -> resposta com evidências.
