# Contraponto 20 — Juiz independente, decisão rastreável

## Quem decide?

- Usuário: escolhe modelos, define caso e padrão de prova, anexa documentos. Não escolhe resultado.
- Acusação e defesa: analisam documentos e apresentam argumentos usando os modelos configurados.
- Juiz: **um terceiro LLM, independente**, recebe os argumentos e trechos rastreáveis e decide **uma única vez ao final** no Tribunal Simulado.
- Código: controla turnos, valida respostas e apresenta a fundamentação. **Não transforma automaticamente a decisão do LLM em outra decisão.**

## Contrato do veredito

`judgeCase` espera JSON contendo `decision`, `reason`, `standardAssessment`, `findings`, `missingEvidence` e `citations`. Decisões válidas: `culpado`, `nao_comprovado`, `indeterminado`.

Em caso de condenação sem ID válido de trecho anexado, falha explícita. Uma resposta vazia ou inválida também falha explicitamente. IDs citados que não pertencem ao caso são excluídos. O UI apresenta nome do documento e trecho original para auditoria. O juiz não recebe ferramentas nem escolhe vencedores com base em nota de oratória.

## Limite importante

O dossiê inclui até três trechos iniciais por documento. **Isso não é leitura completa** de PDFs extensos. A interface informa leitura parcial. Essa versão é um protótipo didático e não constitui sentença, orientação jurídica ou ferramenta para decidir culpa de pessoas reais.

## Offline versus NVIDIA

`index.html` da raiz = **roteiro pré-escrito** com resultado fixo apenas para testar as animações. Não há IA nesse arquivo. No servidor, configure `NVIDIA_API_KEY`, selecione NVIDIA NIM, carregue documentos e execute o caso; então o modelo selecionado para o juiz cria a decisão. A integração real ainda requer testes autenticados na máquina do usuário.

## Testes

Execute `npm run check`, `npm test`, `npm run build:offline`, `npm run test:court-ui`. Os testes de juiz usam `chat` simulado para verificar o contrato sem consumir API.
