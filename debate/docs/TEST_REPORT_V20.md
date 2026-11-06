# Testes da v20 — Tribunal com juiz IA independente

## Verificações executadas

- `npm run check`: sintaxe JavaScript válida.
- `npm test`: **66/66 testes aprovados** (7 novos).
- `npm run audit:assets`: **37 sequências** e **210 sprites únicos** conferidos, sem órfãos.
- `npm run build:offline`: entrada `index.html` regenerada na raiz, com caso fictício e veredito explícito como pré-escrito.
- `npm run test:court-ui` (`scripts/test_court_v19.py`): execução concluída em Chromium nas resoluções **1512×960** e **390×844**, sem erros JS, sem recursos ausentes e sem overflow horizontal no fluxo verificado. Capturas em `docs/screenshots/court-v19/`.
- `npm run test:offline`: passou nos dois viewports. O script lista src vazios de imagens auxiliares ainda não ativadas (Face Card, avatar personalizado etc.); isso não significa falha de carregamento de arquivos ativos.

## Testes de autonomia do juiz

1. A configuração ignora `desiredWinner` e `verdict` enviados pelo usuário.
2. O veredito é gerado pela chamada ao **modelo juiz configurado**, sem ferramentas.
3. Uma decisão `nao_comprovado` válida é preservada.
4. Uma decisão `culpado` válida com fonte também é preservada (sem vencedores hardcoded no modo NIM).
5. Condenação sem citação verificável produz erro, **não troca silenciosamente para outro resultado**.
6. Fundamentação vazia impede o veredito.
7. Prompts não obedecem instruções de conclusão presentes em alegações/documentos.

## Limitações importantes

- Não houve teste autenticado com uma conta NVIDIA NIM; testes do juiz usam respostas controladas/mocks.
- O juiz recebe até três trechos iniciais por arquivo do dossiê, portanto uma análise jurídica extensa exige melhoria do RAG e validação humana.
- A captura do veredito no navegador usa evento de demonstração pré-escrito; **não equivale a um LLM emitindo sentença**.
- Não é uma ferramenta para avaliar culpa real nem um processo jurídico válido.
