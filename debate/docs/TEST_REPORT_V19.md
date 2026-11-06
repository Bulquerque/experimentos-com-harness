# Verificação Contraponto v19

- `npm run check`: OK
- `npm test`: **59/59** testes Node aprovados (5 novos testes do Tribunal).
- `npm run audit:assets`: OK. 37 sequências e 210 sprites únicos, sem órfãos no manifesto ativo.
- `npm run test:court-ui`: OK em viewport 1512×960 e 390×844; teste de seleção de modo, primeira cena por clique, evento de veredito, ocultação do placar de oratória, recursos locais e ausência de erros JavaScript e overflow horizontal.
- `npm run test:menu`: OK em viewport desktop e celular; acordeão, painel de velocidade, clique para continuar, sem scripts/imagens ausentes.
- `npm run test:offline`: OK em desktop e celular; demonstração de ideias sem acesso NIM.

### Importante sobre o teste visual

As capturas de veredito usam a injeção de um **evento já roteirizado** no mesmo manipulador de eventos da interface, sem acelerar dezenas de animações simultâneas. O teste de reprodução completa acelerada do Tribunal ficou preso no Chromium desta sessão. **Não afirmar que esse teste específico passou.** A parte lógica do Tribunal é coberta por testes Node e a primeira cena + veredito foram conferidos no navegador.

### Ainda não testado

- Uso autenticado do NVIDIA NIM, com chave e modelos verdadeiros.
- Modelos emitindo JSON consistente e chamadas `search_memory` para casos extensos.
- PDFs complexos, digitalizados ou protegidos por senha.
- Volume de arquivos muito grande, multiusuários, isolamento de sessões e infraestrutura pública.
- Correção jurídica de decisões de IA; requer avaliação humana especializada.

### Visual

As capturas encontram-se em `docs/screenshots/court-v19/`.
