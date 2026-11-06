# Testes da normalização geométrica — v24

- 128/128 PNGs de palco RGBA, 512 × 576.
- 128/128 PNGs masters RGBA, 640 × 800, preservando arte completa.
- 128/128 PNGs da v23.1 preservados em `sources/geometry_v23_1_input.zip`.
- **Margem mínima para arte visível no palco: 28 pixels nas laterais e no topo**; borda inferior suavizada depois de y=508 e coberta pelo púlpito na arena.
- Escala por personagem/estado calculada com máscara aproximada da pele no primeiro frame. Um único redimensionamento e deslocamento por estado é compartilhado pelos seus oito quadros, preservando o ritmo e a movimentação.
- Referência de largura facial: Lia, 96 px; Dante, 130 px (valores artísticos específicos a cada personagem).
- `npm run test:geometry`: aprovado.
- `npm run check`: aprovado.
- `npm test`: 83/83 aprovados.
- `npm run audit:assets`: aprovado.
- `npm run test:offline:full`: passou em desktop e celular (25 intervenções, 5 julgamentos, sem overflow horizontal, sem exceções JS).
- `npm run test:geometry:visual`: 16 estados selecionados e sprites carregados corretamente em desktop e mobile, sem erros JS/overflow.
- `python3 scripts/test_catalog_offline.py`: catálogo offline carregou novas animações e juiz Elias.

**Limitações:** O redimensionamento não redesenha detalhes anatômicos nem reconstrói pixels já perdidos na arte original. O limite da borda inferior é suavizado apenas na versão de palco; o master possui a arte sem cortes. Nem todos os quadros do mesmo personagem precisam mostrar a mesma extensão do corpo: a normalização é por referência facial, preservando as diferenças expressivas. Conexão NVIDIA NIM autenticada não foi repetida, pois depende de chave real.
