# Contraponto v17 — revisão de QA

Data: 2026-10-27/28.

## Alterações verificadas

- Avanço **por clique como padrão**: nenhuma cena avança sozinha enquanto o leitor está em modo manual.
- Clique durante o texto digitado: apenas revela a frase. Clique posterior: avança para a próxima cena.
- Barra de espaço e seta para a direita disponíveis como atalhos quando o foco não está num controle.
- Três velocidades de animação: 0,7×, 1× e 1,35×. Quatro velocidades de texto, incluindo instantâneo.
- Modo automático disponível como opção explícita; a ação de pausa continua acessível nesse modo.
- Menus recolhíveis de personagens, regras, câmera/som, histórico e RAG.
- Os sprites usados foram preservados; não foram redesenhadas as artes com cortes nas mãos/ombros.

## Resultados

| Verificação | Resultado |
| --- | --- |
| `npm run check` | OK |
| `npm test` | 54/54 aprovados |
| `npm run audit:assets` | 37 sequências, 210 sprites únicos, sem órfãos |
| `npm run test:reader` | Desktop 1512px e celular 390px: OK |
| `npm run test:offline:full` | 25 intervenções, 5 julgamentos e placar 43×42, desktop/celular: OK |
| Browser errors e overflow | Nenhum erro de JavaScript, nenhum transbordamento horizontal |

Os testes de navegador foram feitos em Chromium, com os mesmos arquivos entregues por uma rota local simulada. **A abertura direta por `file://` não pôde ser executada neste ambiente**, pois o navegador de teste retorna `ERR_BLOCKED_BY_ADMINISTRATOR`. Existe caminho alternativo via `npm run preview:offline`.

**Não foram realizadas chamadas autenticadas ao NVIDIA NIM.** O Debate Singular usa falas e notas predefinidas; os testes do adaptador NIM são simulações de contrato HTTP. Não se afirma que a latência ou a qualidade de modelos reais foram validadas.

## Evidência visual

`docs/screenshots/reader-v17/` contém capturas de início, primeira fala, objeção e resultado final, em desktop e celular.
