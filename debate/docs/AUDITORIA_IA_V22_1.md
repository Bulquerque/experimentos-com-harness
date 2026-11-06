# Auditoria de ativação NVIDIA NIM — Contraponto v22.1

Data: 2026-11-05

## Confirmado localmente

- ZIP v22 íntegro, arquivos do projeto extraídos sem erro.
- `npm run check`: OK (sintaxe JavaScript).
- `npm test`: 77/77 aprovados, incluindo rota HTTP, SSE, modelos NIM simulados, documentos, juiz, sessões, animações e três testes novos do diagnóstico NIM.
- `npm run audit:assets`: OK (37 sequências do manifesto legado e 14 estados novos com 112 PNGs RGBA).
- Smoke test HTTP real em 127.0.0.1: GET `/`, GET `/api/config`, PNG dos atores, POST `/api/debates` modo demo e SSE de debate finalizado com julgamento: todos OK.
- Chave é lida do `.env` no servidor. `.env` não foi incluído no pacote. Nenhum token real foi usado nem armazenado.
- `npm run doctor:nim` sem chave falha corretamente com instruções, sem tentar inferência.

## Não confirmado sem a credencial do usuário

- NVIDIA NIM autenticado e compatibilidade real de todas as chamadas e modelos da conta.
- Créditos, limite de chamadas, permissões Public API Endpoints ou disponibilidade futura dos modelos.
- Resposta JSON de todos os modelos em todos os debates e compatibilidade com ferramentas em qualquer modelo.

## Teste de navegador deste ambiente

- Teste de Chromium em `http://127.0.0.1` retornou `ERR_BLOCKED_BY_ADMINISTRATOR` (restrição do ambiente, não HTTP do servidor).
- O teste visual legado `npm run test:ui` não concluiu nesta execução. Não é contado entre os 77 testes aprovados.

## Como ter alta confiança depois de configurar a chave

1. `npm run doctor:nim`: faz GET do catálogo e **três POSTs pequenos** para validar inferência e JSON dos modelos pré-selecionados (pode consumir créditos). Se qualquer um falhar, ajustar modelo ou credencial antes de prosseguir.
2. `npm start`; abrir `http://localhost:3000` (não o `index.html` direto).
3. Selecionar `NVIDIA NIM real` em Execução. Iniciar um debate curto de 1 rodada, 1 troca, com RAG e web desabilitados inicialmente.
4. Depois ativar RAG, documentos e Tribunal Simulado por etapas. Em Tribunal NIM, anexar e selecionar documentos antes de iniciar.

## Limitações honestas

O diagnóstico não garante disponibilidade 24/7, nem valida todos os caminhos condicionais do debate. Um primeiro teste de ponta a ponta **na conta do usuário** é indispensável.
