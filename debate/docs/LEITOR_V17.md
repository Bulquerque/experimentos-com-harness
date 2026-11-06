# Contraponto v17 — navegação no estilo visual novel

## O que mudou

- **Avanço manual por padrão**: cada clique avança uma cena, sem temporizador automático.
- **Digitação de texto**: o primeiro clique durante a digitação revela a fala completa. Outro clique avança.
- **Teclado**: espaço, seta para a direita e Enter quando a caixa de diálogo está focada.
- **Velocidades independentes**: animações dos sprites/câmera e digitação. Padrão 0,7× para as animações, 35 ms por caractere para o texto.
- **Menus recolhíveis**: personagens, regras/modelos, câmera/áudio, histórico e documentos/RAG.
- **Modo automático opcional**: disponível no menu VELOCIDADES, não recomendado para revisar sprites.
- O roteiro singular mantém 5 rounds, 20 falas, 5 avaliações e resultado simulado 43×42.
- O Harness/NIM não foi modificado: nenhuma chave ou modelo local é necessário para o index.html.

## Código para manter

- `offline/bridge.js`: controlador de cenas, máquina de estados, avanço por clique, texto digitado e adaptador de API fictícia.
- `offline/reader-v17.css`: layout limpo e menus/controles.
- `app/index.html`: marcação comum organizada em seções recolhíveis.
- `app/ui/sprite-director.js`, `app/ui/performance-director.js` e `app/ui/camera-director.js`: escalonamento das durações das animações.
- `scripts/build-offline.py`: produz o `index.html` na raiz e o bundle clássico para abrir offline.

## Para testar

```sh
npm run build:offline
npm run check
npm test
npm run test:reader
npm run test:offline:full
```

**Limites**: o teste direto `file://` não foi possível no navegador do ambiente, que bloqueia por política de segurança. Os mesmos arquivos foram testados via rota local simulada, sem chamadas NIM. A normalização dos recortes de ombro e mãos continua pendente — nenhuma arte foi redesenhada nesta etapa.
