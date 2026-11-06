# Segurança: escopo e ameaças

O servidor é destinado a uso em **127.0.0.1**. A chave NVIDIA deve ficar fora de `workspace/`, idealmente no `.env` da raiz, transmitida ao contêiner de app por Docker Compose. O arquivo `.env` não é incluído no ZIP. Partes do workspace selecionadas pela IA são enviadas ao provedor NVIDIA durante chamadas da API.

O app não tem acesso ao socket do Docker. O runner não recebe `NVIDIA_API_KEY`, não tem acesso à rede, monta `workspace` em modo **somente leitura** e executa comandos em cópias descartáveis, com limites de recursos, tempo e privilégios Linux reduzidos. `transform` é a única operação de alteração persistente prevista na harness.

A visualização HTML usa `iframe sandbox="allow-scripts"` sem `allow-same-origin`, e uma política CSP restritiva. Não tem acesso à chave em JavaScript. Recursos externos (CDNs etc.) são bloqueados por padrão nas prévias.

A API HTTP é local, mas não implementa autenticação de múltiplos usuários. Não abra portas publicamente, não use com múltiplos usuários não confiáveis e não guarde segredos dentro do workspace. Docker e seu kernel têm superfície de ataque própria: endurecimento de contêiner não garante isolamento absoluto de execução adversarial.

O instalador opcional de Mathlib usa rede externa para baixar dependências; não recebe a chave NVIDIA. Revise dependências antes de uso em ambiente crítico.

## Limites de isolamento (v0.6)

O executor é um contêiner com rede desligada e sem chaves de API, mas os comandos de avaliação são processos no **mesmo** contêiner do serviço executor. O sistema não foi auditado como fronteira contra adversários, e não deve receber código de terceiros hostis em ambiente multiusuário. Para execução hostil, é necessário isolamento por contêiner/microVM por comando, com política de syscalls, disco e PID próprios. A checagem de Lean bloqueia buracos e axiomas declarados diretamente, mas não garante ausência de axiomas em imports e macros.

## Cuidados adicionais 0.6

- A aplicação exige um serviço executor configurado, sem fallback para um Docker avulso montado no workspace original.
- O executor exige RUNNER_TOKEN com no mínimo 16 caracteres e não possui senha padrão. O Compose exige token interno não vazio. `start.ps1` e `start.sh` geram um token criptograficamente aleatório na instalação. **Não** disponibilize o socket Unix a outros contêineres.
- O workspace original está montado como `:ro` dentro do executor. Um comando ainda pode ler dados desse volume; os filtros de cópia **não** devem ser considerados política de sigilo. Nunca coloque credenciais no workspace.
- O contêiner de preparação Mathlib tem rede apenas durante instalação, não recebe chave NVIDIA e deve ser usado somente com projetos/dependências confiáveis.
- O modo de provas estritas bloqueia buracos sintáticos explícitos, não representa auditoria de axiomas ou garantia de equivalência semântica.
