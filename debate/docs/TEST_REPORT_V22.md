# Relatório de verificação — Contraponto v22

- 14 estados de Lia/Dante, 8 quadros por estado, total 112 PNGs RGBA, com canal alfa entre 0 e 255.
- `npm run check`: passou.
- `npm test`: 74/74 testes passaram.
- `npm run audit:assets`: passou para o legado mantido para Elias e compatibilidade.
- `python3 scripts/test_offline.py`: passou no Chromium desktop e mobile; a interface do modo offline permaneceu navegável.
- Chromium virtual com assets servidos localmente: manifest v22 com 14 estados carregado, imagens PNG sem erro, sprites com `data-motion-set=v22`, palco/púlpito visível e troca de estados funcionando. Nenhum erro JS observado na prévia verificada.
- Não houve teste NIM autenticado (exige credenciais do usuário); as interfaces de tribunal e as rotas de backend foram mantidas sem mudanças.
- Cortes que já existiam dentro do quadro original, sobretudo nas laterais da Objection!, não foram reconstruídos; o púlpito mascara cortes na base.

Capturas em `docs/screenshots/v22_inicio.png` e `docs/screenshots/v22_debate.png`.
