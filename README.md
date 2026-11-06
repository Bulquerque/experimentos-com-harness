# Experimentos com Harness

Recorte experimental do Harness de debates do Contraponto. O código organiza participantes, rodadas, falas, ferramentas e avaliações. Esta publicação contém o motor de debate e um exemplo textual; não inclui a interface, os sprites, arquivos pessoais ou a base de documentos do projeto original.

## Requisitos

- Node.js 20 ou superior
- `NVIDIA_API_KEY` apenas para chamar modelos NVIDIA NIM. A demonstração local não precisa de chave.

## Rodar a demonstração

```bash
npm run demo
```

A demonstração usa respostas simuladas e não chama serviços externos.

## Estrutura

- `harness/`: loop de debate, construção de prompts, adaptador NIM, ferramentas e avaliação.
- `app/ui/breakdown-policy.js`: regra pura usada pelo motor para manter o tratamento de reações consistente.
- `examples/run-demo.js`: execução local curta, sem credenciais.
- `tests/`: verificações existentes do motor de debate e dos prompts.

## Uso do motor

Importe `createDebateEngine` de `harness/harness.js` e `validateConfig` de `harness/config.js`. Passe a configuração validada a `runDebate`; seu callback `emit(type, data)` recebe eventos como `turn`, `judgment`, `finished` e `error`.

O modo `demo` é simulado. Para usar NIM, forneça `NVIDIA_API_KEY` no ambiente do processo e selecione `mode: "nim"`; chamadas reais podem consumir créditos e dependem dos modelos habilitados na conta. Nunca coloque a chave em código versionado.

## Verificações

```bash
npm test
```

## Escopo e limitações

Este é um recorte para estudo do Harness, não uma cópia completa do Contraponto e nem um serviço hospedado. Não inclui a interface visual, os assets de áudio/animação, a biblioteca de documentos ou as configurações privadas.
