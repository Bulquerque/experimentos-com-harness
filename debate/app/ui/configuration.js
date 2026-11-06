/** Leitura do formulário: não conhece NIM nem a execução do debate. */
import { $ , node } from './dom.js';

function readAgent(side) {
  const sideId = side.toLowerCase();
  const fields = ['name', 'position', 'viewpoint', 'role', 'objective', 'instructions', 'personality', 'color', 'model'];
  return Object.fromEntries(fields.map(key => [key, $(`${key === 'personality' ? 'persona' : key}-${sideId}`).value]));
}

export function formConfig() {
  return {
    topic: $('topic').value.trim(), agents: [readAgent('A'), readAgent('B')],
    format: $('debate-format')?.value === 'court' ? 'court' : 'debate',
    caseTitle: $('case-title')?.value.trim(), allegation: $('case-allegation')?.value.trim(),
    jurisdiction: $('case-jurisdiction')?.value.trim(), proofStandard: $('case-standard')?.value,
    caseDocumentIds: [...document.querySelectorAll('.case-document-check:checked')].map(x => x.value),
    caseEvidencePlan: [...document.querySelectorAll('.case-evidence-round')].map(el => ({documentId:el.dataset.documentId,releaseRound:Number(el.value)})),
    judgeModel: $('model-judge').value,
    rounds: Number($('rounds').value),
    roundTopics: [...document.querySelectorAll('.round-subtopic-input')].map(x => x.value.trim()),
    turnTimeoutSec: Number($('turn-timeout').value),
    exchanges: Number($('exchanges').value),
    wordLimit: Number($('word-limit').value),
    allowWeb: $('allow-web').checked,
    allowRag: $('allow-rag').checked,
    allowPastDebates: $('allow-past').checked,
    mode: $('mode').value
  };
}

export function renderRoundTopics(values = null) {
  const previous = values || [...document.querySelectorAll('.round-subtopic-input')].map(x => x.value);
  const parent = $('round-topic-fields');
  parent.replaceChildren();
  for (let i = 0; i < Number($('rounds').value); i++) {
    const label = node('label', 'round-topic-label');
    label.append(node('span', null, `${$('debate-format')?.value==='court'?'SESSÃO':'ROUND'} ${String(i + 1).padStart(2, '0')}`));
    const field = node('input', 'round-subtopic-input');
    field.type = 'text';
    field.maxLength = 240;
    field.placeholder = `Subtópico ${i + 1} (opcional)`;
    field.value = previous[i] || '';
    field.setAttribute('aria-label', `Subtópico do round ${i + 1}`);
    label.append(field);
    parent.append(label);
  }
}
