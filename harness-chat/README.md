# Harness Chat

Chat e agente NVIDIA para matemática, Python e Lean 4. A interface mostra as respostas em Markdown e LaTeX e separa a atividade ao vivo — chamadas de ferramentas, método e detalhes de execução — da resposta final. Skills próprias podem ser criadas e reutilizadas. O agente pode trabalhar com anexos usando um runner isolado.

## Executar

Requer Docker Engine com Compose (Linux/macOS) ou Docker Desktop (Windows). O Node.js 22 é necessário para os testes locais.

1. Linux/macOS: `./start.sh`; Windows: `./start.ps1`. O script cria `.env` local na primeira execução.
2. Configure `NVIDIA_API_KEY` no `.env` para usar um modelo NVIDIA. A chave permanece no backend.
3. Acesse `http://127.0.0.1:8787`.

A primeira inicialização do runner baixa dependências do ambiente de cálculo e pode levar alguns minutos. Mathlib é opcional; consulte `setup-mathlib.sh` ou `setup-mathlib.ps1`.

## Verificar

```sh
./check.sh
npm run typecheck
npm run build
```

`./check.sh` não exige chave NVIDIA, Docker nem o workspace local. Essas verificações não comprovam disponibilidade externa do modelo, configuração real de Docker/Lean nem permissões da conta NVIDIA.

## Pastas

- `apps/server/src/`: API, contexto, loop do agente, ferramentas, skills e trilha de execução.
- `apps/web/fallback/`: interface do chat e dependências estáticas licenciadas.
- `apps/runner/` e `docker/`: executor isolado e imagens.
- `qa/`: testes de contrato da interface.
- `workspace/`: diretório local para arquivos de trabalho. O conteúdo de usuário não é versionado.

Mantenha a chave em `.env`. Não publique esta aplicação diretamente na internet sem adicionar autenticação apropriada. Consulte `docs/SEGURANCA.md` e `docs/ARQUITETURA.md`.
