/** Contraponto — seleção de arte. Inteiramente visual, sem chamadas ao Harness.
 * Personagens A/B podem ser renomeados no formulário sem trocar o pacote de imagens.
 * O manifesto é a fonte única de caminhos de sprites e faixas de olhos.
 */
export const characterFolders = {a:'lia', b:'dante'};

const POSES = {
  neutral:'neutro', confident:'confiante', thinking:'pensativo',
  surprised:'surpreso', frustrated:'frustrado', excited:'determinado'
};

/** Escolhe a pose pelo gesto, ação e emoção — nesta ordem de prioridade. */
export function poseName(turn={}) {
  if(turn.action==='objection'||turn.gesture==='point'||turn.gesture==='slam-desk') return 'objecao';
  if(turn.emotion==='surprised'||turn.emotion==='frustrated'||turn.emotion==='thinking') return POSES[turn.emotion];
  if(turn.gesture==='arms-crossed') return 'confiante';
  if(turn.gesture==='open-hand') return 'falando';
  return POSES[turn.emotion]||'neutro';
}

/** Faixa panorâmica: cada ação utiliza a mesma biblioteca de emoções. */
export function eyesName(turn={}) {
  if(turn.action==='objection')return 'objecao';
  if(turn.action==='rebuttal')return 'determinado';
  if(turn.action==='question')return 'pensativo';
  if(turn.action==='concession')return 'confiante';
  if(turn.emotion==='surprised')return 'surpresa';
  return poseName(turn);
}

export function artUrl(side, folder, pose) {
  if(!['a','b'].includes(side))return null;
  if(!['pose','eyes','conversation'].includes(folder))return null;
  if(!/^[a-z_0-9]+$/.test(pose))return null;
  const sub=folder==='pose'?'expressoes':folder;
  return `/assets/characters/${characterFolders[side]}/${sub}/${pose}.png`;
}
