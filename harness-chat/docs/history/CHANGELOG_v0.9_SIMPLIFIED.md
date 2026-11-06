# v0.9 — Menos abas, mais fluxo

- Navegação visível reduzida de sete destinos para **Trabalhar** e **Configurações**.
- Arquivos, prévia responsiva, Lean 4 e histórico real viraram seções recolhíveis de Trabalhar; só uma permanece aberta por vez.
- A seção Pesquisa foi retirada da navegação; código, matemática e pesquisa são solicitações no mesmo prompt.
- Removidos seletor de categoria de tarefa, botões de configuração duplicados, métricas prematuras e link redundante de eventos.
- Demonstração foi movida para Exemplos de tarefas (não é execução real).
- Header compacto, sem barra lateral persistente; desktop e celular seguem o mesmo fluxo.
- React/TypeScript opcional alinhado à navegação de duas áreas.
- Teste de integração HTTP do Lean atualizado para validar o novo ponto de entrada sem alterar endpoints.

Sem mudanças nos seis contratos da harness, no executor Docker ou nas rotas NVIDIA/Lean.

## Verificação

- Node backend: 33/33
- Python: 6/6
- Contratos UI: 4/4
- Playwright estático: 1440, 768, 390 e 320 px; verificadas ações de prompt, drawers, Lean, preview e navegação
- TSX: transpileModule sem erros sintáticos; **bundle React não compilado** por indisponibilidade do npm
- Docker real, Lean real, NVIDIA: **não testados** nesta máquina
