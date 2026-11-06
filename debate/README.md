# Contraponto Debate

Aplicação visual de debates e tribunal didático, com modo offline e integração opcional com NVIDIA NIM. Lia e Dante debatem; o Juiz Elias avalia as rodadas. A arena também oferece biblioteca de documentos para o fluxo de tribunal.

## Executar

Requer Node.js 20.11 ou superior.

```sh
cp .env.example .env
# preencha NVIDIA_API_KEY no .env apenas se for usar NIM real
npm start
```

Abra `http://localhost:3000`. Para experimentar sem servidor ou chave, abra `index.html` no navegador: essa rota reproduz um roteiro demonstrativo pré-escrito e não chama um modelo.

## Verificar

```sh
npm test
npm run check
npm run audit:assets
```

Os testes automatizados locais não comprovam conexão autenticada à NVIDIA. Para testar NIM com a própria chave, use `npm run doctor:nim`; a execução faz chamadas reais e pode consumir créditos. Nunca coloque chaves no frontend ou no Git.

## Pastas

- `app/`, `offline/`: experiência visual e sua versão offline.
- `harness/`, `server/`: agentes, integração NIM e servidor.
- `tests/`, `scripts/`, `tools/`: testes e ferramentas de manutenção.
- `app/assets/`: arte e efeitos necessários à arena.
- `data/`: dados locais em tempo de execução; arquivos JSON são ignorados pelo Git.

Arquivos `.env`, memória local, arquivos-fontes originais, screenshots e previews gerados foram excluídos desta publicação. Alguns utilitários de processamento de arte precisam dos originais locais que não são distribuídos neste repositório.
