# Auditoria Contraponto v23 — 5 de novembro de 2026

## Resultado
- 83 de 83 testes automatizados JavaScript passaram.
- `npm run check`: sintaxe OK.
- `npm run audit:assets`: manifesto do legado/juiz Elias íntegro, sem órfãos.
- **16 sequências novas** (8 Lia, 8 Dante), **128 PNGs RGBA** transparentes com canvas de 512×576.
- `Breakdown`: dois GIFs originais, 8 quadros cada, preservados em `sources/breakdown`.
- Teste Chromium no laboratório offline: as animações de Lia e Dante chegaram ao quadro 3/8, carregaram imagens de 512 pixels e não produziram erros de JS.
- Teste offline completo Chromium desktop e mobile: 25 entradas no histórico, 5 notas do juiz, nenhum erro de JS ou transbordamento horizontal.
- Servidor HTTP local: rotas `/`, PNG Breakdown de ambos, manifesto, política JS e `/api/config` retornaram 200.
- Teste da harness com NIM simulado e derrota grande: o motor preserva pelo menos 2 segundos após o julgamento antes de começar o round seguinte.
- No final do debate, a cena de encerramento pode reapresentar a reação sem perder a pose final.

## Política
Breakdown não é acionado por palavras-chave. O sistema usa notas estruturadas do juiz; requer desvantagem grave ou derrotas consecutivas e uma lacuna acumulada, com cooldown entre reações. No Tribunal, apenas veredito conclusivo não simulado ativa o colapso dramático do lado desfavorecido.

## Limites
- A remoção do fundo quadriculado de Dante é uma máscara de pixels neutros; podem existir halos finos nos detalhes do cabelo, que exigiriam retoque manual para acabamento perfeito.
- A borda inferior dos GIFs originais termina abruptamente; o púlpito esconde a base. Não se inventaram pixels fora do arquivo fonte.
- **NVIDIA NIM real não foi testado com credenciais válidas do usuário.** É necessário configurar `.env` e executar `npm run doctor:nim` antes do primeiro uso em modo real.
- O roteiro offline é uma demonstração, com julgamento e textos pré-escritos. O novo Breakdown pode ser inspecionado pelo laboratório mesmo que a simulação não tenha derrotas graves.
