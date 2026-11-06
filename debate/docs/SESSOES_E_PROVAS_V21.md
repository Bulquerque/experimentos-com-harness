# Contraponto v21 — Sessões e provas progressivas

## Objetivo
Transformar rounds do Tribunal em sessões com novas evidências. Promotoria e defesa precisam reagir à evolução do caso, sem antecipar documentos ainda não admitidos. O juiz decide ao final sem resultado configurável pelo usuário.

## Esquema de configuração

```json
{
  "format": "court",
  "rounds": 4,
  "caseDocumentIds": ["UUID-DO-REGISTRO", "UUID-DO-LAUDO"],
  "caseEvidencePlan": [
    {"documentId":"UUID-DO-REGISTRO", "releaseRound":1},
    {"documentId":"UUID-DO-LAUDO", "releaseRound":3}
  ]
}
```

Os valores acima são ilustrativos; a API aceita apenas UUIDs válidos previamente anexados. Se nenhum plano for indicado, os arquivos anexados entram na primeira sessão, mantendo compatibilidade com a v20.

## Operação ao vivo

- `round_start`: abre a sessão e mostra o subtópico.
- `evidence_released`: documento admitido, com `documentId`, `round`, `reason`, `releasedIds`.
- `thinking`, `turn` e `tool`: cada agente vê os IDs autorizados **naquele turno**; `search_memory` filtra trechos pelo conjunto liberado.
- `case_verdict`: juiz recebe documentos liberados, histórico de admissões, falas e citações verificadas; decide autonomamente.

Para liberar antecipadamente uma prova previamente anexada, com sessão ativa:

```http
POST /api/debates/{id}/evidence
Content-Type: application/json

{"documentId":"UUID-DO-DOCUMENTO"}
```

Rejeita documentos fora do dossiê, sessão encerrada ou formato não judicial. A liberação repetida é idempotente. A ação só muda **quais documentos podem ser consultados**, nunca o resultado nem as falas existentes.

## Interface

A biblioteca mostra uma sessão selecionável por documento. O botão **Liberar agora** fica disponível apenas durante um processo em andamento. A revelação aciona um cartão de documento na arena, som de papel e uma entrada no histórico. A caixa de diálogo não é bloqueada.

## Roteiro demonstrativo sem IA

Quatro sessões, três revelações (`EX-01` sessão 1, `EX-03` sessão 2, `EX-02` sessão 3), 16 falas e um veredito **fixo e identificado como simulado**. Use `index.html`, clique para avançar. As falas da sessão inicial não citam documentos ainda indisponíveis.

## Segurança e limites

- Não existe modelo local; a demo é um roteiro fixo.
- O juiz não recebe nomes dos modelos nem o campo de vencedor.
- A versão usa armazenamento JSON local, sem contas ou isolamento multiusuário de produção.
- Acesso a documentos é validado por ID do dossiê, e nenhum documento futuro entra na busca RAG antecipadamente.
- Evidência não equivale a verdade: o juiz deve interpretar, questionar e justificar a sua decisão.
- Uma nova prova anexada depois do início exigiria nova funcionalidade; nesta versão o usuário só libera arquivos que já incluiu ao abrir o processo.

## Testes

- `npm test` — 72 testes Node, incluindo autorização, RAG por sessão, liberação manual HTTP e progressão de cenas.
- `npm run test:court-sessions` — cenas de quatro sessões em Chromium desktop/celular, veredito, overflow horizontal e URLs locais.
- `npm run audit:assets` — 37 sequências, 210 sprites referenciados, sem órfãos.
- **Pendente:** validar fluxo com API NVIDIA NIM real, longos documentos em produção e controles em dispositivos físicos.
