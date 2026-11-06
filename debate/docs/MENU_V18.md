# Contraponto v18 — navegação editorial

## Objetivo
Palco como foco. Menus recolhíveis e discretos, com nomes claros e um único botão de início/continuação no modo offline. Mantém o leitor de visual novel (um clique revela, outro avança), sem alterar o Harness.

## Design
- Paleta noturna de tinta azul, acento dourado para ação principal, azul suave para informações de sistema.
- Barra de reprodução compacta no topo, com `Começar a história / Continuar`, reiniciar, contador e ajustes de ritmo.
- Painel esquerdo com tema fixo do roteiro e dois painéis recolhíveis: participantes e regras.
- Painel do juiz enxuto, com imagem, progresso, vereditos e acesso sob demanda ao RAG.
- Controles de câmera/som, estúdio, catálogo e histórico em seções recolhíveis abaixo do palco.
- No celular, primeiro o palco; configurações e juiz ficam abaixo da cena.
- Um único botão principal visível no offline. Os controles antigos são mantidos internamente por compatibilidade.

## Locais de edição
- `app/styles/menu-v18.css`: tema da experiência com servidor.
- `offline/menu-v18.css`: o mesmo tema para abrir o HTML offline.
- `app/ui/menu-v18.js`: comportamento da navegação da versão com servidor.
- `offline/bridge.js`: avançar o roteiro com botão superior, digitação e teclado.
- `scripts/build-offline-v18.py`: compila o HTML raiz a partir do frontend atual e mantém caminhos locais.

## Como abrir
Extraia todo o ZIP; abra `index.html`. Os assets precisam permanecer na mesma estrutura de pastas. Se seu navegador não permitir a origem `file://`, execute `npm run preview:offline` e abra `http://localhost:8080/index.html`.

## Escopo do modo offline
Roteiro fixo de 5 rounds, 20 falas e 5 julgamentos. O campo tema é somente leitura no HTML offline para não prometer edição de um roteiro predefinido. O modo com servidor mantém os controles de modelos e configurações editáveis.

## Verificações
- `npm run check`: sintaxe do JavaScript.
- `npm test`: 54 testes automatizados do projeto.
- `npm run audit:assets`: integridade das animações (37 sequências/210 imagens).
- `npm run test:menu`: testes em Chromium em 1512×960 e 390×844; menus, botão principal, início do roteiro, ausência de erros e ausência de rolagem horizontal.
- `scripts/test_reader_v17.py` foi executado novamente, porém a tentativa posterior ficou presa no processo do Chromium. Não é contada como teste concluído nesta versão. A inspeção de telas e navegação acima terminou corretamente.
- Sem chamada NVIDIA NIM real nesta versão.

## Limites
Ainda há sprites com recortes de mãos e ombros a revisar artisticamente; não foram redesenhados. A abertura direta por `file://` permanece não validada nesta máquina, que pode bloquear essa origem no navegador automatizado.
