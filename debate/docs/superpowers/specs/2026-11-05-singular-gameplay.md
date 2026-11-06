# Debate Singular: fala, reação, som e juiz

## Objetivo

Fazer o Singular funcionar como uma cena de jogo narrativo: uma fala legível por vez, avanço controlado pela pessoa, animações encadeadas sem se atropelar, identidade e cor consistentes entre texto/personagem/transcrição, áudio expressivo e juiz Elias presente na cena.

## Críticas cobertas

1. Debate corre sozinho e rápido; controlar o avanço por fala.
2. Mais animações que falas e movimentos que se sobrepõem; coordenar entrada, fala e reação.
3. Nome/cor/avatar por vezes não correspondem; fixar A/B no render e orientar perspectiva do modelo.
4. Falta voz/efeitos durante falas; aproveitar áudio já disponível para falantes e ações.
5. Elias precisa comentar com som/gesto e permitir interação por clique.

## Comportamento

- O modo Singular apresenta a primeira fala ao iniciar. Depois, cada avanço solicita exatamente a próxima fala; pausado/cancelado continuam funcionando.
- A fala permanece visível e audível até a pessoa avançar. Modos NIM e Tribunal preservam o fluxo atual.
- Falante, nome, cor e avatar vêm do mesmo lado A/B. Resposta que adote a tese contrária não altera o nome/cor exibidos.
- A reação do ouvinte pode ocorrer junto da fala, mas um novo gesto do falante não inicia antes do fim da fala atual.
- A fala do juiz usa a razão/avaliação existente quando disponível; no roteiro Singular, comentários são claramente comentários simulados. Clicar em Elias abre/reproduz uma explicação contextual sem alterar a pontuação.
- Efeitos são sincronizados com ações e falas; preferência de áudio/desbloqueio do navegador é respeitada.

## Limites

Não alterar o juízo, notas, roteiro temático ou chamada NIM para criar efeitos. Não prometer garantia semântica de geração: prompts e normalização visual reduzem inversões, mas o texto gerado ainda pode divergir da tese.
