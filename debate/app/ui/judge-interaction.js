/** Comentários do Elias usam o contexto já recebido, sem alterar notas ou chamar IA. */
export function createJudgeInteraction({audio,sprites,onComment,canInteract=()=>true}={}) {
  const root=document.getElementById('judge-interaction');
  const text=document.getElementById('judge-comment-text');
  const label=document.getElementById('judge-comment-label');
  let judgment=null;
  let commentaryIndex=0;
  const names=()=>['a','b'].map(side=>document.getElementById(`display-name-${side}`)?.textContent?.trim()||side.toUpperCase());
  const reason=()=>String(judgment?.reason||'').trim();
  function present(message,{automatic=false,kind='commentary'}={}) {
    if(!message)return;
    if(text)text.textContent=message;
    if(label)label.textContent=automatic?'ELIAS · AVALIAÇÃO DA RODADA':'ELIAS · COMENTÁRIO';
    root?.classList.add('has-comment');
    if(!automatic)sprites?.judgeAction(kind==='verdict'?'verdict':'opening');
    audio?.stopSpeech();
    onComment?.({text:message,name:'JUIZ ELIAS',automatic,kind,round:judgment?.round});
  }
  function interact(intent='comment') {
    if(!canInteract()){
      if(text)text.textContent='Aguarde o fim desta fala. Elias pode comentar quando a próxima fala estiver disponível.';
      return false;
    }
    audio?.unlock();
    const [a,b]=names();
    let message;
    if(intent==='reason') {
      message=reason()?`${judgment.round?`Na rodada ${judgment.round}, minha avaliação foi`:'Minha decisão foi'}: ${reason()}`:'Ainda não atribuí notas. Vou comparar o raciocínio, as evidências, as respostas ao outro lado e a clareza de cada participante.';
    } else if(intent==='advice') {
      message=reason()?`Para a próxima fala, respondam diretamente à avaliação: ${reason()} Expliquem qual evidência sustenta a conclusão e enfrentem o argumento do outro lado.`:`${a} e ${b}, apresentem uma afirmação por vez, sustentem a conclusão com evidências e respondam ao ponto central do adversário.`;
    } else if(reason()) {
      const winner=judgment.winner==='empate'?'Houve empate':['A','B'].includes(judgment.winner)?`${judgment.winner==='A'?a:b} teve a maior nota`:'Esta é a fundamentação da minha decisão';
      message=`${winner}${judgment.round?` na rodada ${judgment.round}`:''}. ${reason()}`;
    } else {
      const comments=[
        `${a} e ${b}, estou acompanhando as duas posições. Uma boa refutação responde ao argumento apresentado, e precisa de justificativa.`,
        'Atenção às evidências. Um exemplo pode esclarecer uma ideia; para sustentar uma conclusão geral, expliquem também os seus limites.',
        'A ordem da fala não muda a identidade dos participantes. Cada lado deve defender sua posição e reconhecer os pontos que o outro demonstrou.'
      ];
      message=comments[commentaryIndex++%comments.length];
    }
    present(message);
    return true;
  }
  function setJudgment(data) {
    judgment=data||null;
    // A fundamentação acompanha a tensão da deliberação. O cue de impacto
    // do veredito, sincronizado ao martelo, libera a tensão depois.
    if(reason())present(reason(),{automatic:true,kind:'commentary'});
  }
  function reset() {
    judgment=null;commentaryIndex=0;
    root?.classList.remove('has-comment');
    if(label)label.textContent='CONVERSE COM ELIAS';
    if(text)text.textContent='Clique no retrato ou escolha uma pergunta. Elias comenta os argumentos e explica sua última avaliação.';
  }
  document.getElementById('judge-talk')?.addEventListener('click',()=>interact());
  root?.querySelectorAll('[data-judge-question]').forEach(button=>button.addEventListener('click',()=>interact(button.dataset.judgeQuestion)));
  return {setJudgment,reset,interact};
}
