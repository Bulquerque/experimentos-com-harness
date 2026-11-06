# Teste visual v16 — roteiro de atuação independente de NIM

## Entradas do projeto

- `index.html` **na raiz**: navegador local, interface da arena e script offline embarcado em arquivos clássicos. Não usa `fetch`, WebSocket, EventSource real ou NVIDIA.
- `app/index.html` via `npm start`: aplicação completa com Harness, servidor, SSE, RAG e conexão NIM quando configurada.
- `offline/catalog.html`: catálogo offline dos 37 grupos de animação.

## Roteiro estendido

Tema: IA e criatividade. Cinco rounds e vinte falas dos personagens, cobrindo abertura, objeção, pergunta, refutação, concessão, emoção, movimento de rosto, corpo e estado de escuta. Cinco avaliações pré-escritas do juiz, com placar **Lia 43 × 42 Dante**. O roteiro em `offline/scenario.json` é explícito e não tem relação com um modelo real.

## Testes realizados

- 54/54 testes Node aprovados; sintaxe JavaScript aprovada; auditoria do manifesto: 37 sequências, 210 sprites, sem quadros órfãos.
- Chromium, desktop 1512×900 e celular 390×844: roteiro inteiro até o placar final; 25 registros na transcrição (20 falas + 5 julgamentos); cinco notas do juiz; ausência de exceções JS e de transbordamento horizontal.
- Reiniciar, pausar e continuar validados; painel de catálogo carregou 12 sequências de Lia e 13 de Elias e reproduziu quadros PNG reais.
- Capturas disponíveis em `docs/screenshots/offline-v16/`.

## Limitação ambiental dos testes

O Chromium da infraestrutura bloqueia navegações diretamente para `file://` e certos hosts locais com `ERR_BLOCKED_BY_ADMINISTRATOR`. Por isso, o teste de navegador carregou o **mesmo HTML, JS, CSS e recursos locais** através de um interceptador de arquivos, sem respostas de NIM/servidor. A abertura por duplo clique não pôde ser comprovada diretamente nesse navegador, embora o aplicativo use scripts clássicos, URLs relativas e manifesto carregado localmente para funcionar sem HTTP. Se uma máquina restringir `file://`, o projeto oferece `npm run preview:offline` como alternativa.

## O que depende de testes no computador do usuário

- Áudio no dispositivo físico e restrições de autoplay após clique.
- Duplo clique em `index.html` no navegador específico do usuário.
- Integração NVIDIA NIM real exige .env com chave e teste autenticado no modo servidor.
