# Relatório de QA — Contraponto v15

## Testes concluídos

- `npm run check`: sintaxe JavaScript aprovada.
- `npm run audit:assets`: 37 sequências, 210 PNGs únicos efetivamente usados, zero quadros sem referência no manifesto; 15 URLs literais de imagem verificadas em CSS/HTML.
- `npm test`: **51 testes Node aprovados**, zero falhas (Harness, NIM simulado, ferramentas, HTTP, RAG, áudio, sprites, três personagens e estrutura das pastas).
- `npm run test:ui`: uma execução concluída com sucesso após a reorganização para `app/` e `harness/`: Debate Singular, sprites, Face Card, juiz, áudio e desktop/mobile sem rolagem lateral indevida. As capturas dessa execução foram salvas em `docs/screenshots`.

## Ressalva de reprodução

Uma repetição posterior do teste de navegador ficou bloqueada no processo de Chromium/Playwright e foi interrompida por timeout; não houve resultado final dessa segunda execução. **Não é correto chamar essa repetição de aprovada.** Os arquivos e verificações visuais apresentados são os da primeira execução concluída e das capturas anteriores ao bloqueio.

## Capturas importantes

- `screenshots/storyboard-v15.jpg`: seis cenas de teste de direção visual.
- `screenshots/mobile-qa-v15.jpg`: três estados em tela móvel.
- `screenshots/arena-desktop.png` / `arena-mobile.png`: layout completo.
- `screenshots/facecard-stage-desktop.png` / `facecard-stage-mobile.png`: enquadramento e limite do Face Card.
- `screenshots/body-action-stage-desktop.png` / `body-action-stage-mobile.png`: gesto corporal depois do Face Card.
- `screenshots/judge-gavel-desktop.png` / `judge-gavel-mobile.png`: julgamento.

## O que não foi testado

Chamadas autenticadas NVIDIA reais; navegador físico de celular; longas sessões concorrentes; comercialização da gravação Objection!; isolamento multiusuário. O modo simulado usa dados roteirizados, **não** respostas reais de modelos.
