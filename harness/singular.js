/** Debate Singular: roteiro fixo, verificável e 100% offline. Não chama LLM. */
export const SINGULAR_PRESET = Object.freeze({
  topic: 'A inteligência artificial amplia ou empobrece a criatividade humana?',
  rounds: 5, exchanges: 2, wordLimit: 200, turnTimeoutSec: 60,
  roundTopics: [
    'O que conta como criatividade?',
    'Autoria, originalidade e acesso',
    'Como aproveitar os benefícios sem perder autonomia?',
    'Educação, acesso e novas habilidades',
    'Síntese: acordos possíveis e divergências restantes'
  ],
  agents: [
    { name: 'Lia', position: 'a favor', viewpoint: 'IA como instrumento de criação', role: 'Pesquisador e defensor de ferramentas criativas', objective: 'Mostrar quando a IA amplia possibilidades humanas', instructions: 'Valorize exemplos concretos e reconheça riscos reais.', personality: 'estrategista', color: '#55c9ee' },
    { name: 'Dante', position: 'contra', viewpoint: 'Proteção da autoria e da autonomia artística', role: 'Artista e crítica de plataformas digitais', objective: 'Questionar dependência, exploração de dados e homogeneização cultural', instructions: 'Faça perguntas incisivas, sem ataques pessoais.', personality: 'provocador', color: '#f47d86' }
  ],
  allowWeb: false, allowRag: false, allowPastDebates: false, mode: 'singular'
});

// Ordem: rodadas ímpares A/B, rodada par B/A, duas trocas por rodada.
const LINES = {
  '1:1:A': ['Comecemos pela definição: criatividade não é só inventar do zero; é combinar ideias para produzir algo valioso. Uma ferramenta de IA pode oferecer variações que uma pessoa escolhe, transforma e critica. Quem continua respondendo pela criação é o ser humano.', 'confident', 'open-hand', 'argument'],
  '1:1:B': ['Objeção! Produzir muitas variações não significa criar melhor. Se todos partem dos mesmos sistemas, corremos o risco de repetir padrões. Quem decide quais histórias merecem ser contadas: o artista ou o algoritmo?', 'frustrated', 'point', 'objection'],
  '1:2:A': ['Essa pergunta é legítima. Mas um instrumento não elimina a intenção de quem o usa. Um fotógrafo também escolhe enquadramento e luz entre possibilidades técnicas. Precisamos analisar o processo criativo, não apenas a quantidade de imagens geradas.', 'thinking', 'arms-crossed', 'rebuttal'],
  '1:2:B': ['Então minha pergunta é direta: como distinguiremos um trabalho pensado por alguém de uma produção automática feita em massa? Sem transparência, o público pode confundir volume de conteúdo com expressão pessoal.', 'confident', 'point', 'question'],
  '2:1:B': ['Nesta rodada, vamos falar de autoria. Modelos são treinados com muitos materiais. Quando um criador não autorizou determinado uso, a sensação de exploração não desaparece só porque o resultado é tecnicamente impressionante.', 'thinking', 'open-hand', 'argument'],
  '2:1:A': ['Concordo que origem dos dados e remuneração importam. Mas também precisamos considerar estudantes e criadores com poucos recursos que, com assistência de IA, podem experimentar estilos e formatos antes inacessíveis.', 'confident', 'open-hand', 'concession'],
  '2:2:B': ['Acesso é importante, porém quem controla o acesso? Se a ferramenta muda as regras, aumenta preços ou favorece certos estilos, o criador fica dependente de uma plataforma. Diversidade cultural exige autonomia.', 'frustrated', 'slam-desk', 'rebuttal'],
  '2:2:A': ['Você está apontando um risco real. A resposta pode incluir portabilidade, transparência de treinamento, licenças mais claras e educação para não depender de uma única ferramenta. O problema não se resolve apenas proibindo a tecnologia.', 'thinking', 'arms-crossed', 'rebuttal'],
  '3:1:A': ['Proponho um critério para o futuro: usar IA quando ela amplia escolhas e mantém o controle nas mãos do criador. Isso exige declarar processos, preservar alternativas sem IA e avaliar o resultado pelo conteúdo, não pela novidade.', 'excited', 'open-hand', 'argument'],
  '3:1:B': ['Aceito parte desse princípio, mas ele precisa valer na prática. Se o público não sabe como a obra foi feita e o criador não pode auditar a ferramenta, a promessa de controle permanece frágil.', 'thinking', 'arms-crossed', 'concession'],
  '3:2:A': ['Então concordamos sobre uma exigência mínima: informação clara sobre ferramentas e direitos. A divergência está em nossa previsão; eu vejo mais oportunidades quando existem regras que protegem escolhas humanas.', 'confident', 'point', 'rebuttal'],
  '3:2:B': ['E eu continuo cautelosa com a concentração de poder. Mas reconheço que, sob regras transparentes e com acesso diverso, a IA pode ajudar alguns criadores. A questão principal talvez seja quem define essas regras.', 'thinking', 'open-hand', 'concession'],
  '4:1:B': ['Veja uma sala de aula em que todos recebem a mesma resposta pronta. O aluno aprende a formular perguntas ou apenas aprende a aceitar sugestões? Quero saber como impedir que a facilidade substitua a descoberta.', 'confident', 'open-hand', 'question'],
  '4:1:A': ['Você está descrevendo um uso ruim, não um destino inevitável. Quando um estudante compara três soluções, encontra erros e explica por que escolheu uma, a tecnologia pode virar um laboratório de pensamento.', 'excited', 'open-hand', 'rebuttal'],
  '4:2:B': ['Objeção! Sem orientação, o estudante talvez não perceba que a resposta é convincente, mas incorreta. A fluência do sistema pode esconder incertezas. Quem ensina a desconfiar da resposta?', 'frustrated', 'point', 'objection'],
  '4:2:A': ['Essa crítica me fez rever uma parte da minha tese. Não basta democratizar o acesso: é preciso ensinar avaliação de fontes, autoria e limites do modelo. Nesse ponto, eu concedo que a educação vem antes da ferramenta.', 'thinking', 'arms-crossed', 'concession'],
  '5:1:A': ['Estamos chegando ao ponto central: a criatividade cresce quando há autonomia. Defendo uma regra simples: qualquer criação assistida por IA precisa preservar o direito de modificar, explicar e rejeitar o resultado.', 'confident', 'open-hand', 'argument'],
  '5:1:B': ['Concordo com o direito de rejeitar. Mas e quem não pode sair da plataforma, porque o trabalho inteiro depende dela? Um princípio bonito não resolve desigualdades de poder. Precisamos de alternativas reais.', 'thinking', 'arms-crossed', 'concession'],
  '5:2:A': ['Então proponho um acordo verificável: transparência sobre uso de IA, formação crítica, diversidade de ferramentas e remuneração justa quando houver uso de obras protegidas. Isso responde à sua principal objeção?', 'excited', 'point', 'question'],
  '5:2:B': ['Responde a parte dela. Ainda considero a concentração de poder perigosa, mas reconheço que essas condições abririam espaço para usos positivos. Nossa discordância não é se pessoas podem criar com IA; é quem controla as regras.', 'surprised', 'open-hand', 'concession']
};
const JUDGMENTS = {
  1: { scoreA: 8, scoreB: 8, winner: 'empate', reason: 'Os dois lados apresentaram definições úteis de criatividade. Lia explicou o papel da escolha humana; Dante questionou padronização e transparência.', feedbackA: 'Boa analogia, faltou evidência empírica.', feedbackB: 'Perguntas fortes; inclua exemplos verificáveis.' },
  2: { scoreA: 8, scoreB: 9, winner: 'B', reason: 'Dante articulou com mais precisão as questões de autoria e dependência. Lia reconheceu os problemas e apresentou propostas, mas sem demonstrar sua eficácia.', feedbackA: 'Propostas construtivas, ainda hipotéticas.', feedbackB: 'Crítica coerente sobre poder das plataformas.' },
  3: { scoreA: 9, scoreB: 8, winner: 'A', reason: 'Lia sintetizou um critério concreto de uso responsável. Dante ofereceu ressalvas importantes. Ambos fizeram concessões consistentes.', feedbackA: 'Boa síntese e reconhecimento de limites.', feedbackB: 'Boa concessão sem abandonar a tese.' },
  4: { scoreA: 8, scoreB: 9, winner: 'B', reason: 'Dante questionou a dependência de respostas prontas, enquanto Lia fez uma concessão importante sobre pensamento crítico.', feedbackA: 'Boa evolução do argumento; faltou exemplo concreto de resultado.', feedbackB: 'Objeção incisiva, com um risco bem definido.' },
  5: { scoreA: 10, scoreB: 8, winner: 'A', reason: 'Lia apresentou critérios de ação concretos e abriu espaço para acordos. Dante manteve sua crítica, mas reconheceu ganhos possíveis.', feedbackA: 'Síntese clara, conciliando oportunidade e proteção.', feedbackB: 'Ressalvas relevantes e concessão fundamentada.' }
};
export function scriptedTurn(round, exchange, speaker) {
  const line = LINES[`${round}:${exchange}:${speaker}`];
  if (!line) throw new Error('Intervenção do roteiro singular inexistente.');
  const [speech, emotion, gesture, action] = line;
  return { speech, emotion, gesture, action, citations: [] };
}
export function scriptedJudgment(round) {
  if (!JUDGMENTS[round]) throw new Error('Julgamento do roteiro singular inexistente.');
  return { round, ...JUDGMENTS[round], simulated: true, scripted: true };
}
