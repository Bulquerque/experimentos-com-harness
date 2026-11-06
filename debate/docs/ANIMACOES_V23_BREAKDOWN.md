# Contraponto v23 — Breakdown (descabelando)

## Assets
- `app/assets/actors-v22/lia/breakdown/01..08.png`: animação da Lia (verde removido), 8 quadros RGBA.
- `app/assets/actors-v22/dante/breakdown/01..08.png`: animação do Dante (checkerboard claro removido), 8 quadros RGBA.
- Originais preservados em `sources/breakdown/`; prévias APNG com transparência em `previews/breakdown/`.
- Ambos normalizados para 512×576, centralizados sem corte lateral da fonte; púlpito cobre base.
- GIFs fonte não possuem áudio e não foram alterados. Os outros 14 estados permanecem intactos.

## Política de atuação
`breakdown` é a **oitava animação de cada personagem**; não é loop. É uma reação dramática à avaliação estruturada — **não é um detector de verdade nem prova de que um lado esteja objetivamente errado**.

No Debate de Ideias, `breakdownFromJudgments(judgments)` exige:
1. derrota no round de 3+ pontos, com nota do perdedor <= 5; **ou**
2. pelo menos 2 derrotas consecutivas e desvantagem acumulada de 4+ pontos.

Para não repetir o gesto a cada nova derrota, existe intervalo mínimo de duas rodadas entre ativações consecutivas do mesmo personagem. A aplicação preserva ~2,15 s antes de começar o round seguinte nesses casos; no último resultado, reproduz a reação novamente após finalizar a cena. O gesto termina congelando o último quadro. A próxima cena cancela timers antigos.

No Tribunal Simulado, apenas veredito *não simulado e conclusivo* pode acionar a reação final: `culpado` afeta o lado B (defesa), `nao_comprovado` afeta o lado A (acusação). `indeterminado` nunca ativa.

O novo estado pode ser testado manualmente no **Laboratório de Animações** e nos dois catálogos (HTTP e offline).

## Qualidade e limitações
O fundo do Dante foi incorporado como padrão cinza no GIF original; sua remoção é por máscara de fundo conectado às bordas, não um PNG de origem genuinamente transparente. Alguns píxeis de antialias podem necessitar revisão visual em outros cenários; as prévias permitem verificar. Personagens personalizados têm precedência sobre sprites padrão. O modo `prefers-reduced-motion` mostra a pose final sem animar.

Execução NIM mantém configuração e chave exclusivamente no backend; estados visuais não alteram as saídas dos modelos.

## Revisão v23.1 — Dante
O Breakdown de Dante foi substituído pelo novo GIF de fundo verde. Oito quadros RGBA de 512×576 com margens laterais transparentes e escala constante. O antigo GIF permanece em `sources/breakdown/dante_breakdown_previous_v23.gif`. Alguns quadros originais já tocam a borda direita e esse material não pode ser restaurado apenas com margens.

## Normalização v24
Os 16 estados de Lia e Dante foram redimensionados por âncoras faciais; o arquivo v23.1 original foi preservado. A arte integral dos Breakdowns permanece em `sources/full_geometry_v24`, enquanto a versão de palco é suavizada abaixo do púlpito. As regras de disparo não foram alteradas.
