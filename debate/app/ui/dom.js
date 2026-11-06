/** Pequenos auxiliares de DOM e HTTP usados somente pelo navegador. */
export const $ = id => document.getElementById(id);

export function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text); // Nunca usar innerHTML com saída de LLM.
  return element;
}

export function toast(message) {
  const element = $('toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('show'), 4500);
}

export async function api(route, options = {}) {
  const response = await fetch(route, options);
  let data;
  try { data = await response.json(); }
  catch { throw new Error(`Resposta inválida do servidor (${response.status}).`); }
  if (!response.ok) throw new Error(data.error || `Erro HTTP ${response.status}`);
  return data;
}

export function optionList(select, models, selected) {
  select.replaceChildren();
  for (const model of models) {
    const option = node('option', null, model.label);
    option.value = model.id;
    select.append(option);
  }
  if (selected && models.some(model => model.id === selected)) select.value = selected;
}
