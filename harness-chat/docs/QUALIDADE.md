# Qualidade e critérios de aprovação

## Níveis separados de evidência

1. **Unitário:** testes Node/contratos da interface e exemplos Python.
2. **Estático:** `web_assets`, `web_script_syntax`, `node_syntax`, compilação Python/TypeScript e Lean quando houver executor.
3. **Integração:** rota HTTP, runner simulado, eventos e cancelamento.
4. **E2E real:** Docker, API NVIDIA, Lean real, browser e dependências instaladas — obrigatório antes de afirmar aptidão para uso em produção.
5. **Aceitação da tarefa:** requisitos explícitos conferidos contra o artefato. Atualmente não existe verificador universal de aceitação em linguagem natural; `checks_passed` é evidência parcial.

## Mudanças Harness Chat 1.0

- Modo Chat sem exposição nem execução de ferramentas.
- Contexto de diálogo limitado e validado, sem mensagens `system`/`tool` injetáveis pelo cliente.
- Interface única sem React, com histórico local, configuração, arquivos e auditoria.
- Integração simulada de modelo com histórico e ferramenta ativada/desativada; smoke HTTP com endpoint real e provedor local simulado.

## Confiabilidade herdada da v0.11

- Node tests e Python tests com zero casos são reprovados.
- A checagem de sintaxe inclui `.js`, `.mjs` e `.cjs`.
- Um loop de falhas idênticas é interrompido após três tentativas.
- A memória resumida preserva metadados de edição e testes, não saída textual bruta.
- O runner não aceita um token padrão.

## Histórico v0.10

- `agent.ts` separado de `model.ts` e `context.ts`.
- Status honesto `checks_passed` em lugar de falsa declaração de tarefa integralmente verificada.
- Nova checagem `web_script_syntax` (JavaScript embutido e JS local referenciado por HTML), executada sem avaliar código.
- Regressões para script inválido e para testes que passam sem nenhuma alteração.
- Documentação histórica deslocada para `docs/history/`.
- `check.sh`/`check.ps1` e CI de testes locais.

## Restrições atuais

- Sem Docker/NVIDIA/Lean reais validados nesta execução.
- A checagem TypeScript (`npm run typecheck`) exige instalar `@types/node` e `typescript` com `npm install`; não foi possível baixar dependências neste ambiente offline. Os testes nativos Node e Python foram aprovados sem essa instalação.
- Teste de sintaxe JavaScript não é teste em navegador.
- Ambiente Docker é adequado como isolamento de desenvolvimento local, não certificado para código malicioso.
