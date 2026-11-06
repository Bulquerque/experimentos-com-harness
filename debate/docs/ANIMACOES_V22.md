# Contraponto v22 — Atores transparentes

## Escopo
Substituição **somente da atuação de Lia e Dante** pela biblioteca de 14 sequências (7 estados × 2 personagens; 8 frames cada) produzida na Arena v7. O juiz Elias, interface, roteiro de debate de ideias, tribunal, fontes de prova, sons, câmera e backend NIM ficam preservados.

## Temporização
Velocidade por quadro em `app/assets/actors-v22/manifest.json` (milissegundos). `Idle`: 355 ms/quadro (≈2,84 s por volta em 1×, ≈4,06 s no ritmo offline padrão de 0,7×); Talking: 170 ms/quadro; ações dramáticas de 135 a 205 ms/quadro. O seletor `Ritmo` offline continua funcionando. A duração da animação do juiz permanece independente.

## Comportamento
- `thinking` enquanto a fala é gerada; `talking` em apresentação normal; `objection` em acusação, com final sustentado por 550 ms (ajustado pelo controle de ritmo) antes do Talking.
- Reações do ouvinte: surprised na objeção, frustrated na refutação, thinking na pergunta, confident na concessão. Agendadas e canceláveis.
- Fila de quadros e atualização de `img.src` continuam no SpriteDirector; não se toca nos textos, julgamentos e documentos.
- `app/styles/actors-v22.css` faz o púlpito à frente da base dos sprites (apenas os dois debatedores).

## Origem e limitações
Os 112 PNGs RGBA são cópias exatas dos quadros transparentes da Arena v7; não foi feita regeneração da arte. O contorno verde foi removido anteriormente; não há chroma-key por CSS. Cortes já existentes nas bordas laterais de quadros originais não podem ser restaurados pela sobreposição do púlpito. Use a galeria de animação no aplicativo para conferência.

## Arquivos
- `app/assets/actors-v22/{lia,dante}/{idle,talking,thinking,confident,objection,surprised,frustrated}/01..08.png`
- `app/assets/actors-v22/manifest.json`
- `app/ui/sprite-director.js`
- `app/styles/actors-v22.css`
- `offline/manifest.js` e `offline/app.bundle.js` gerados por `npm run build:offline`

Não há alterações em `harness/`, `server/` ou em configurações de acesso ao NIM.
