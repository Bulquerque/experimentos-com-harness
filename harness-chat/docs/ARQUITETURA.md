# Arquitetura

```text
Navegador (HTML/CSS/JS estático, chat + localStorage)
    │  HTTP + SSE
    ▼
apps/server/src/index.ts ──────► API NVIDIA NIM
    │                             ▲
    ▼                             │
chat.ts (valida histórico)
    │
agent.ts ─► model.ts ─────────────┘
    ├── context.ts     (histórico limitado)
    ├── tools.ts       (6 operações públicas)
    ├── workspace.ts   (arquivos/revisões)
    ├── assurance.ts   (cobertura de evidências)
    └── runner.ts ── socket ──► apps/runner/server.mjs
                               (Docker sem rede, cópia temporária)
```

## As seis ferramentas

`orient` busca; `inspect` lê trechos e hashes; `transform` cria/substitui com transação; `execute` experimenta numa cópia descartável; `verify` seleciona e executa checagens; `preview` prepara HTML sandboxed. Nenhuma ferramenta promete que o resultado corresponde integralmente ao pedido humano.

## Estados de uma execução

- `running`: modelo e/ou ferramentas ainda executando.
- `checks_passed`: mudanças registradas, cobertura compatível e verificações recentes passaram. **Não é aceitação do pedido**.
- `unverified`: resposta disponível, mas sem evidência técnica suficiente.
- `failed`: erro de execução da harness ou serviço.
- `cancelled`: execução interrompida.

## Verificadores

HTML/CSS requer `web_assets` e `web_script_syntax` (ambos estáticos). JavaScript usa `node_syntax`, Python usa `python_compile` e testes quando presentes, TS/TSX requer `npm_build`, Lean exige `lean_core` ou `mathlib_build` segundo o local. Cada resultado carrega as evidências executadas, falhas e limitações.

As verificações não garantem comportamento de navegador, alinhamento de especificação ou certeza matemática fora do teorema formal.

## Interfaces

A única interface é `apps/web/fallback/` — sem React, build frontend ou dependências extras. Conversas são armazenadas no navegador; o servidor valida o histórico e impõe limites antes de encaminhar ao modelo. Modo Chat desativa as ferramentas no envio e no recebimento. Modo Agente habilita as seis ferramentas originais.

## Arquivos importantes

- `.env.example`: configuração sem credenciais.
- `compose.yaml`: app e runner em contêineres distintos.
- `workspace/`: única área que o agente deve modificar.
- `qa/`: testes de contrato e contrato de frontend e E2E de API.
- `scripts/`: checagens locais sem serviços externos.
