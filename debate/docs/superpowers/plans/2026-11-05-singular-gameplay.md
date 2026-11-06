# Debate Singular — plano de implementação

> **Para execução:** completar as frentes seguintes em paralelo respeitando os limites de arquivos e integrar no checkout corrente.

**Objetivo:** Resolver as críticas de ritmo, identidade, animação, falas/efeitos sonoros e juiz interativo no Debate Singular.

**Arquitetura:** O Harness continua dono da sequência e eventos SSE; sessões oferecem avanço manual somente ao modo singular. O app associa os eventos à UI, com nome/cor pelo lado A/B. Diretores visuais e de áudio mantêm a execução dos recursos locais existentes. Um controlador de juiz expõe comentários sem modificar a avaliação.

**Restrições globais:** Não alterar decisões/notas do juiz nem o conteúdo de evidências. O modo NIM e Tribunal mantêm seu fluxo. Respeitar Cancelar/Pausar e preferências de áudio. Não criar nem executar testes automatizados nesta tarefa; verificar sintaxe e fluxo manual de navegador.

## Tarefas

- [ ] 1. Tornar a sessão Singular pausável por passo, liberando uma fala por comando e preservando SSE/cancelamento.
- [ ] 2. Adicionar interação com Elias, comentários contextuais e efeitos existentes, sem alterar notas.
- [ ] 3. Sincronizar som de fala/ações e animações para não sobrepor ciclos de falas.
- [ ] 4. Fixar associação de nome, lado, avatar e cor; alinhar a perspectiva dos modelos.
- [ ] 5. Integrar mudanças, atualizar bundle offline se aplicável, iniciar backend e conferir fluxo e URL.

**Verificação manual:** abrir a aplicação, iniciar Singular, confirmar a primeira fala e avançar fala-a-fala; observar troca de falante/nome/cor, animação da pessoa ativa e reação do ouvinte; clicar em Elias e ouvir comentário/efeito; pausar/cancelar; conferir que NIM/Tribunal seguem sem passo forçado. Fazer apenas checks estáticos de sintaxe, sem executar suites.
