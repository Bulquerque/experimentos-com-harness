# Changelog v0.6 — Harness e ambiente

| Prioridade | Alteração | Verificação |
|---|---|---|
| Alta | Invalidação de verificação diante de mudança posterior no arquivo | Teste automatizado |
| Alta | Falha de comando posterior invalida conclusão prévia | Teste automatizado |
| Alta | Executor apenas via serviço Docker Compose | Testes de ausência de executor, documentação |
| Alta | Cancelamento de processo após desconexão HTTP | Teste integrado do executor |
| Alta | UID distinto para código executado (Compose) | Configurado; Docker real pendente |
| Média | Compactação de contexto em grupos, sem romper tool-call/result | Teste automatizado |
| Média | Argumentos JSON inválidos rejeitados | Teste automatizado |
| Média | Mathlib lida no volume RO com Lake | Mock HTTP; Mathlib real pendente |
| Média | Seleção de modo Core/Mathlib no site | Interface inspecionada; browser E2E pendente |
| Média | Diagnóstico dos 3 runtimes no próprio site | HTTP simulado; Docker real pendente |
| Média | Prévia CSS independente da ordem dos atributos | Testes de backend e análise |

**Aviso:** O núcleo da harness continua tendo exatamente 6 ferramentas. `doctor` é um serviço de ambiente, não uma ferramenta adicional exposta ao modelo.
