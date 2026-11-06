# Contraponto Debate + Harness Chat

Repositório público com dois projetos independentes que podem usar NVIDIA NIM:

- **[Contraponto Debate](debate/README.md)** — arena visual de debates, tribunal didático e harness de agentes. A experiência offline funciona sem chave; chamadas NIM reais exigem configuração local.
- **[Harness Chat](harness-chat/README.md)** — chat e agente para matemática, Python e Lean 4, com atividade detalhada, ferramentas, skills próprias e runner isolado.

Cada projeto tem seus próprios comandos de instalação e testes. Leia o README da pasta correspondente antes de executar.

## Estrutura

```text
.
├── debate/       # aplicação Contraponto e motor de debate
└── harness-chat/ # aplicação Harness Chat
```

As chaves ficam em arquivos `.env` locais, criados a partir de `.env.example`; não as adicione ao Git. Diretórios de dados de usuário e execução também são ignorados pelo repositório.

## Verificação rápida

```sh
(cd debate && npm test && npm run check)
(cd harness-chat && ./check.sh)
```

A suíte local não valida credenciais, disponibilidade ou permissões dos serviços externos da NVIDIA. O repositório não inclui os dados locais do usuário nem a chave usada nas instalações locais.
