# Contraponto 19 — Tribunal Simulado e biblioteca de provas

## Dois modos, a mesma arena

**Debate de Ideias:** Lia e Dante defendem posições sobre ciência, política, religião, filosofia ou outros assuntos. O juiz pontua cada rodada. Não há veredito sobre culpa.

**Tribunal Simulado:** Lia representa a promotoria, Dante representa a defesa e Elias decide uma única vez após as fases. A proposta é **didática e experimental**. Não gera sentença válida, parecer jurídico ou determinação real de culpabilidade.

## Como usar o Tribunal com NIM real (somente no backend)

1. Execute `npm start` e abra `http://localhost:3000`.
2. No seletor **Formato**, escolha **Tribunal Simulado**.
3. Expanda **Processo e provas**. Escreva título, alegação, jurisdição/contexto e padrão de prova.
4. Abra a **Biblioteca RAG** e envie quantos documentos quiser até os limites operacionais da versão: até 40 arquivos selecionados por operação, cada arquivo até 3 MB e até 150 mil caracteres de texto extraído. Extensões: PDF com camada textual, TXT, MD. Para PDF digitalizado, faça OCR antes.
5. Expanda **Processo e provas** e marque os documentos que integram ESTE processo. Outros documentos da biblioteca não serão usados por `search_memory` no tribunal.
6. Defina as quatro fases ou outras pautas por rodada e configure os modelos de promotoria, defesa e juiz.
7. Ative **NVIDIA NIM real** e configure `NVIDIA_API_KEY` no arquivo `.env` no servidor. Não coloque a chave no HTML. Inicie.

### O que o juiz efetivamente recebe

- Alegações, contexto, padrão de prova e transcrição do caso.
- Amostras rastreáveis dos **três primeiros trechos** de cada documento selecionado, com IDs de origem.
- Fontes que os debatedores recuperaram durante a execução por `search_memory`.
- Aviso de leitura parcial quando existem trechos não incluídos automaticamente.

**Atenção:** a indexação abrange o texto extraído de todos os documentos selecionados, mas o contexto entregue em uma única chamada ao juiz NÃO equivale à leitura integral de todos os documentos e páginas. Um sistema jurídico sério exigiria recuperação exaustiva, verificações humanas, cadeia de custódia, controle de acesso e validação por especialistas.

### Controle de evidências

- `caseDocumentIds` delimita quais documentos podem ser consultados no caso.
- `getCaseDossier()` oferece um índice com IDs de trechos verificáveis.
- `searchMemory(..., { documentIds })` não consulta documentos de outros casos.
- O juiz recebe somente informações relevantes e não recebe poder para chamar ferramentas arbitrárias.
- Citações inventadas são descartadas. Uma conclusão "culpado" sem qualquer citação comprovável é convertida para "indeterminado".
- Ausência de prova é classificada como acusação não comprovada, sem inferir inocência factual.

## Como visualizar offline sem NVIDIA

Abra o `index.html` na raiz do projeto (o navegador precisa permitir arquivos locais) e, no menu **Formato da demonstração**, selecione **Tribunal Simulado**.

É um caso fictício com quatro etapas, 16 falas e um veredito **inteiramente pré-escrito**. Os documentos EX-01, EX-02 e EX-03 exibidos no modo offline são exemplos fixos: **não são arquivos enviados e nem foram avaliados por LLM**. Use o modo com servidor e chave NVIDIA para analisar os arquivos que você adicionar.

## Organização do código

- `harness/harness.js` — alterna participantes e chama o juiz final no modo tribunal.
- `harness/court.js` — prompt, validação e normalização da decisão final.
- `harness/prompts.js` — papéis, objetivos, cuidado com a origem das evidências.
- `harness/memory.js` — ingestão, RAG, filtro por documentos selecionados.
- `app/ui/configuration.js` — configura o caso, documentos e participantes.
- `app/app.js` — apresenta sentença simulada, citações e pontos não comprovados.
- `offline/court-scenario.json` — roteiro fictício, testável sem NIM.

## Segurança e privacidade

Esta versão não possui sistema de login, isolamento multiusuário, criptografia de dados em repouso nem políticas de retenção. Não é adequada para documentos confidenciais, protegidos por sigilo ou contendo dados pessoais de processos reais em um servidor público. O mecanismo de extração também precisa de endurecimento adicional antes da exposição à internet. Os modelos generativos podem errar e omitir provas; sempre exija revisão humana qualificada.

## Regra consolidada de autonomia do juiz (v20)

O usuário pode anexar documentos, configurar acusação, defesa, o modelo do magistrado e o padrão de prova. **Não há campo para escolher o veredito.** A decisão é exclusiva do modelo do juiz após ouvir as partes. O servidor faz apenas validação de formato e de IDs de documentos; **nunca substitui uma decisão inválida por outra**. Quando não há fundamentação, ou uma condenação não apresenta citação documental verificável, a sessão informa erro e nenhum veredito é emitido.

As provas recuperadas são amostras limitadas pelo orçamento de contexto; o sistema informa leitura parcial e não deve ser usado para julgar casos reais. O modo offline permanece uma história fixa, explicitamente identificada como demonstração pré-escrita, não decisão de LLM.
