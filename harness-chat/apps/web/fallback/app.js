/* Harness Chat: framework-free interface. The backend owns tools, keys and execution. */
'use strict';
const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
const create = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
};
const STORE = 'harness-chat-v1';
const MODEL = 'nvidia/nemotron-3.5-bolt-e4b';
const LEGACY_DEFAULT_MODEL = 'nvidia/nemotron-3-super-120b-a12b';
const SLOW_DEFAULT_MODEL = 'z-ai/glm-5.3-flash';
const newId = () => crypto.randomUUID();
const restoreState = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE)||'{}');
    if (!Array.isArray(raw.chats)) throw Error('invalid');
    const chats = raw.chats.slice(0,10).filter(c => c && typeof c.id==='string' && Array.isArray(c.messages)).map(c=>({
      id:c.id, title:String(c.title||'Nova conversa').slice(0,85),
      skillIds:Array.isArray(c.skillIds)?[...new Set(c.skillIds.filter(id=>typeof id==='string'&&/^[a-z0-9][a-z0-9-]{0,47}$/.test(id)))].slice(0,3):[],
      messages:c.messages.slice(-60).filter(m=>m && ['user','assistant'].includes(m.role) && typeof m.content==='string').map(m=>({
        role:m.role,content:m.content.slice(0,12000),runId:typeof m.runId==='string'?m.runId:null,
        status:m.status||'',verification:m.verification||'',calls:Number(m.calls)||0,pending:Boolean(m.pending),artifacts:Array.isArray(m.artifacts)?m.artifacts:[],attachments:Array.isArray(m.attachments)?m.attachments.map(a=>({name:String(a.name||''),mimeType:String(a.mimeType||''),size:Number(a.size)||0,sha256:String(a.sha256||'')})):[]
      }))
    }));
    const savedModel=typeof raw.model==='string'?raw.model.trim():'';
    const modelIsSaved=!!savedModel&&savedModel!==LEGACY_DEFAULT_MODEL&&savedModel!==SLOW_DEFAULT_MODEL;
    return {chats,activeId:raw.activeId,model:modelIsSaved?savedModel:MODEL,modelIsSaved,mode:raw.mode==='chat'?'chat':'agent'};
  }catch{return {chats:[],activeId:null,model:MODEL,mode:'agent'};}
};
const state = {...restoreState(),key:'',activeRun:null,stream:null,openPanel:'',health:null,events:[],focusedRun:null,traceTimer:null,skills:[],skillsLoaded:false,pendingAttachments:[],activityDisclosure:new Map()};
function persist(){
  try {localStorage.setItem(STORE,JSON.stringify({chats:state.chats.slice(0,10).map(c=>({...c,messages:c.messages.map(({events,attachments,...m})=>({...m,...(attachments?.length?{attachments:attachments.map(({name,mimeType,size,sha256})=>({name,mimeType,size,sha256}))}:{})}))})),activeId:state.activeId,...(state.modelIsSaved?{model:state.model}:{}),mode:state.mode}));}
  catch { /* Storage can be disabled; chat still works in this page. */ }
}
function activeChat(){return state.chats.find(c=>c.id===state.activeId);}
function newChat(){
  if(state.activeRun)return;
  $('#sidebar').classList.remove('open');
  const chat={id:newId(),title:'Nova conversa',messages:[]};
  state.chats.unshift(chat);state.chats=state.chats.slice(0,10);state.activeId=chat.id;
  persist();render();$('#prompt').focus();
}
function setChat(id){if(state.activeRun)return;$('#sidebar').classList.remove('open');state.activeId=id;persist();render();}
function deleteChat(id){if(state.activeRun)return;state.chats=state.chats.filter(c=>c.id!==id);if(!state.chats.length){newChat();return;}if(state.activeId===id)state.activeId=state.chats[0].id;persist();render();}
function renderSidebar(){
  const target=$('#chat-list');target.replaceChildren();
  for(const chat of state.chats){
    const row=create('div','chat-row'+(chat.id===state.activeId?' selected':''));
    const title=create('button','chat-row-title',chat.title);title.type='button';title.title=chat.title;
    title.style.cssText='background:none;border:0;color:inherit;padding:0;text-align:left;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    title.addEventListener('click',()=>setChat(chat.id));
    const del=create('button','chat-row-delete','×');del.type='button';del.title='Excluir conversa';del.setAttribute('aria-label',`Excluir ${chat.title}`);
    del.addEventListener('click',()=>deleteChat(chat.id));
    row.append(create('span','','◌'),title,del);target.append(row);
  }
}
function appendInline(parent,text){
  const pattern=/(`[^`\n]+`|\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|\[[^\]]+\]\([^\s)]+(?:\s+"[^"]*")?\))/g;
  let cursor=0,match;
  while((match=pattern.exec(text))){if(match.index>cursor)parent.append(document.createTextNode(text.slice(cursor,match.index)));
    const token=match[0];let node;
    if(token.startsWith('$')||token.startsWith('\\(')||token.startsWith('\\['))node=document.createTextNode(token);
    else if(token.startsWith('`'))node=create('code','inline-code',token.slice(1,-1));
    else if(token.startsWith('**')||token.startsWith('__'))node=create('strong','',token.slice(2,-2));
    else if(token.startsWith('*')||token.startsWith('_'))node=create('em','',token.slice(1,-1));
    else {const bits=token.match(/^\[([^\]]+)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)$/);let url;try{url=new URL(bits[2],location.origin);}catch{}
      if(bits&&url&&['http:','https:','mailto:'].includes(url.protocol)){node=create('a','markdown-link',bits[1]);node.href=url.href;node.rel='noopener noreferrer';node.target='_blank';if(bits[3])node.title=bits[3];}
      else node=document.createTextNode(token);
    }
    parent.append(node);cursor=pattern.lastIndex;
  }
  if(cursor<text.length)parent.append(document.createTextNode(text.slice(cursor)));
}
function appendText(parent,text){
  // Build DOM from plain text only. Model HTML is never parsed or inserted.
  const lines=String(text).replace(/\r\n?/g,'\n').split('\n');let i=0;
  const paragraph=line=>{const p=create('p','markdown-paragraph');appendInline(p,line);return p;};
  while(i<lines.length){const line=lines[i];if(!line.trim()){i++;continue;}
    const fence=line.match(/^\s*```\s*([\w.+-]*)\s*$/);
    if(fence){const code=[];i++;while(i<lines.length&&!/^\s*```\s*$/.test(lines[i]))code.push(lines[i++]);if(i<lines.length)i++;
      const block=create('div','code-block');const bar=create('div','code-toolbar');bar.append(create('span','code-language',fence[1]||'código'));
      const copy=create('button','copy-code','Copiar');copy.type='button';copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(code.join('\n'));copy.textContent='Copiado';setTimeout(()=>copy.textContent='Copiar',1200);}catch{copy.textContent='Selecione para copiar';}});bar.append(copy);
      const pre=create('pre');pre.append(create('code','',code.join('\n')));block.append(bar,pre);parent.append(block);continue;
    }
    if(/^\s*(\$\$|\\\[)\s*$/.test(line)){const opener=line.trim(),closer=opener==='$$'?'$$':'\\]';const math=[opener];i++;while(i<lines.length&&!lines[i].trim().startsWith(closer))math.push(lines[i++]);if(i<lines.length)math.push(lines[i++].trim());const block=create('div','math-source');block.append(document.createTextNode(math.join('\n')));parent.append(block);continue;}
    const heading=line.match(/^(#{1,6})\s+(.+)$/);if(heading){const h=create(`h${heading[1].length}`,'markdown-heading');appendInline(h,heading[2]);parent.append(h);i++;continue;}
    if(/^\s*(---+|\*\*\*+)\s*$/.test(line)){parent.append(create('hr','markdown-rule'));i++;continue;}
    if(/^\s*>/.test(line)){const quote=create('blockquote','markdown-quote');while(i<lines.length&&/^\s*>/.test(lines[i])){appendInline(quote,lines[i++].replace(/^\s*>\s?/,''));if(i<lines.length&&/^\s*>/.test(lines[i]))quote.append(document.createElement('br'));}parent.append(quote);continue;}
    const ul=/^\s*[-*+]\s+/.test(line),ol=/^\s*\d+[.)]\s+/.test(line);if(ul||ol){const list=create(ul?'ul':'ol','markdown-list');while(i<lines.length&&(ul?/^\s*[-*+]\s+/:/^\s*\d+[.)]\s+/).test(lines[i])){const li=create('li');appendInline(li,lines[i++].replace(ul?/^\s*[-*+]\s+/:/^\s*\d+[.)]\s+/,''));list.append(li);}parent.append(list);continue;}
    const para=[];while(i<lines.length&&lines[i].trim()&&!/^\s*```/.test(lines[i])&&!/^(#{1,6})\s+/.test(lines[i])&&!/^\s*>/.test(lines[i])&&!/^\s*[-*+]\s+/.test(lines[i])&&!/^\s*\d+[.)]\s+/.test(lines[i]))para.push(lines[i++]);
    const p=create('p','markdown-paragraph');para.forEach((part,index)=>{appendInline(p,part);if(index<para.length-1)p.append(document.createElement('br'));});parent.append(p);
  }
  if(typeof window.renderMathInElement==='function')window.renderMathInElement(parent,{delimiters:[{left:'$$',right:'$$',display:true},{left:'\\[',right:'\\]',display:true},{left:'\\(',right:'\\)',display:false},{left:'$',right:'$',display:false}],ignoredTags:['script','noscript','style','textarea','pre','code','option'],throwOnError:false,trust:false});
}
function activityCards(events=[],pending=false){
  const cards=[];let currentTool=null;
  for(const [index,event] of events.entries()){
    const key=`event:${event.id??index}:${event.type}`;
    if(event.type==='run_start'){cards.push({key,kind:'step',title:'Preparando a execução',detail:event.detail||'',done:true});currentTool=null;}
    else if(['turn_start','thinking','model_request'].includes(event.type)){
      const title=event.title||'Consultando o modelo',isAnswer=/resposta recebida/i.test(title),isTurn=/^turno\s+\d+/i.test(title);
      if(isAnswer){const activeTurn=[...cards].reverse().find(c=>c.kind==='step'&&/^turno\s+\d+/i.test(c.title));if(activeTurn)activeTurn.done=true;}
      cards.push({key,kind:'step',title,detail:isAnswer?'O modelo respondeu; preparando a resposta final.':isTurn?'Aguardando resposta do modelo neste turno.':'O serviço processa a solicitação.',done:isAnswer||!isTurn,ms:event.ms});currentTool=null;
    }
    else if(['answer_received','model_response'].includes(event.type)){const activeTurn=[...cards].reverse().find(c=>c.kind==='step'&&/^turno\s+\d+/i.test(c.title));if(activeTurn)activeTurn.done=true;cards.push({key,kind:'step',title:event.title||'Resposta recebida',detail:'O modelo respondeu; preparando a resposta final.',done:true,ms:event.ms});currentTool=null;}
    else if(event.type==='tool_start'){const card={key,kind:'tool',title:event.tool||event.title.replace(/^Executando\s+/,'Ferramenta'),detail:event.detail||'',tool:event.tool||'',done:false,ok:null};cards.push(card);currentTool=card;}
    else if(event.type==='tool_result'){let card=[...cards].reverse().find(c=>c.kind==='tool'&&c.tool===(event.tool||'' )&&!c.done);if(!card){card={key,kind:'tool',title:event.tool||event.title,detail:'',tool:event.tool||'',done:false,ok:null};cards.push(card);}card.result=event.detail||'';card.done=true;card.ok=event.ok!==false;card.ms=event.ms;currentTool=card;}
    else if(event.type==='verification')cards.push({key,kind:'step',title:event.title||'Verificação',detail:event.detail||'',done:true,ok:event.ok!==false});
    else if(event.type==='error')cards.push({key,kind:'step',title:event.title||'Erro',detail:event.detail||'',done:true,ok:false});
    else if(event.type==='complete'){if(currentTool&&!currentTool.done)currentTool.done=true;for(const card of cards)if(card.kind==='step')card.done=true;const failed=/falha|cancelad|erro/i.test(event.title||'');cards.push({key,kind:'step',title:event.title||'Resposta final',detail:failed?'Execução encerrada com erro ou cancelamento.':'Resposta concluída',done:true,ok:!failed,ms:event.ms});currentTool=null;}
  }
  if(pending&&cards.length){const last=cards.at(-1);if(last.kind==='tool'&&!last.done){last.active=true;}else if(last.kind==='step')last.active=true;}
  return cards;
}
function activityEntry(card,expanded=false,scope='activity'){
  const details=create('details','activity-step'+(card.kind==='tool'?' tool-step':'')+(card.ok===false?' activity-failed':''));const disclosureKey=`${scope}:${card.key||card.title}`;
  details.dataset.activityKey=disclosureKey;details.open=state.activityDisclosure.has(disclosureKey)?state.activityDisclosure.get(disclosureKey):expanded;
  const summary=create('summary','activity-summary');summary.append(create('span','activity-state '+(card.active?'working':card.ok===false?'failed':card.done?'done':'waiting'),card.active?'◌':card.ok===false?'!':card.done?'✓':'·'));
  // Save explicit user choices only. Automatic expansion of the active step must
  // not turn into a persisted open state when a later SSE render marks it done.
  summary.addEventListener('click',()=>state.activityDisclosure.set(disclosureKey,!details.open));
  summary.append(create('span','activity-title',card.kind==='tool'?`Ferramenta · ${card.tool||card.title}`:card.title));
  if(card.ms!==undefined)summary.append(create('span','activity-duration',`${card.ms} ms`));
  details.append(summary);
  if(card.detail){const args=create('div','activity-label',card.kind==='tool'?'Argumentos':'Resumo');const pre=create('pre','activity-code',card.detail);details.append(args,pre);}
  if(card.result!==undefined){const label=create('div','activity-label',card.ok===false?'Resultado · erro':'Resultado');const pre=create('pre','activity-code',card.result);details.append(label,pre);}
  return details;
}
function activityFeed(events=[],pending=false,runId='unknown'){
  const cards=activityCards(events,pending);if(!cards.length)return null;
  const disclosure=create('details','activity-feed');const disclosureKey=`inline:${runId}:feed`;disclosure.dataset.activityKey=disclosureKey;disclosure.open=state.activityDisclosure.has(disclosureKey)?state.activityDisclosure.get(disclosureKey):Boolean(pending);
  const glyph=create('span','activity-feed-glyph',pending?'◌':'›');
  const summary=create('summary','activity-feed-summary');summary.append(glyph,document.createTextNode(`Atividade · ${cards.filter(c=>c.kind==='tool').length} ferramenta(s), ${cards.filter(c=>c.kind==='step').length} etapa(s)`));
  summary.addEventListener('click',()=>state.activityDisclosure.set(disclosureKey,!disclosure.open));
  disclosure.addEventListener('toggle',()=>{glyph.textContent=disclosure.open?'⌄':'›';});
  disclosure.append(summary);const list=create('div','activity-steps');
  cards.forEach((card,index)=>list.append(activityEntry(card,pending&&index===cards.length-1&&Boolean(card.active),`inline:${runId}`)));disclosure.append(list);return disclosure;
}
function renderMessage(message){
  const row=create('article','message '+message.role);
  if(message.role==='assistant')row.append(create('div','message-avatar','H'));
  const content=create('div','message-body');const text=create('div','message-content');
  if(message.pending)text.append(create('div','pending','● Processando sua mensagem...'));
  else {appendText(text,message.content||'');if(message.status==='failed'||message.status==='cancelled')text.classList.add('message-error');}
  for(const attachment of message.attachments||[]){const card=create('div','attachment-message');if(attachment.previewUrl&&attachment.mimeType?.startsWith('image/')){const img=create('img','attachment-preview');img.src=attachment.previewUrl;img.alt=attachment.name;card.append(img);}card.append(create('span','',`${attachment.name} · ${attachment.size} bytes`));content.append(card);}
  content.append(text);
  if(message.role==='assistant' && message.runId){
    const feed=activityFeed(message.events||[],Boolean(message.pending),message.runId);if(feed)content.append(feed);
    for(const item of message.artifacts||[]){const card=create('div','artifact-card');if(item.mimeType?.startsWith('image/')){const img=create('img','artifact-preview');img.src=`/api/runs/${message.runId}/artifacts/${item.id}`;img.alt=item.name;card.append(img);}const link=create('a','artifact-download',`${item.name} · ${item.size} bytes`);link.href=`/api/runs/${message.runId}/artifacts/${item.id}`;link.download=item.name;card.append(link);content.append(card);}
    const meta=create('div','message-meta');meta.append(create('span','',message.status==='checks_passed'?'Checagens técnicas aprovadas':message.status==='unverified'?'Resposta não verificada':message.status==='failed'?'Falha de execução':message.status==='cancelled'?'Interrompido':message.pending?'Executando':'Resposta'));
    if(message.calls)meta.append(create('span','',`· ${message.calls} ferramenta(s)`));
    if(!message.pending&&message.content){const copy=create('button','','Copiar resposta');copy.type='button';copy.setAttribute('aria-label','Copiar resposta inteira');copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(message.content);copy.textContent='Copiada';setTimeout(()=>copy.textContent='Copiar resposta',1200);}catch{copy.textContent='Cópia indisponível';}});meta.append(copy);}
    const btn=create('button','','Ver execução');btn.addEventListener('click',()=>openActivity(message.runId));meta.append(btn);
    content.append(meta);
  }
  row.append(content);return row;
}
const examples=[
 ['MATEMÁTICA','Demonstre a fórmula do método de Newton e explique as hipóteses de convergência.'],
 ['PYTHON','Inspecione numerical/newton.py, execute os testes e sugira melhorias sem alterar os arquivos.'],
 ['LEAN 4','Leia proofs/Examples.lean e formalize um teorema simples, verificando a prova com Lean 4.'],
 ['PESQUISA','Proponha um experimento reproduzível para comparar métodos de diferenciação numérica.']
];
function renderMessages(){
 const area=$('#messages');area.replaceChildren();const chat=activeChat();
 if(!chat||!chat.messages.length){
   const welcome=create('section','welcome');welcome.append(create('div','welcome-badge','H·'),create('h1','','O que vamos construir hoje?'),create('p','','Um agente de verdade: conversa com contexto, lê arquivos, executa Python, prova teoremas com Lean 4 e mostra o que realmente foi verificado.'));
   const suggestions=create('div','suggestions');for(const [tag,prompt] of examples){
     const b=create('button','suggestion');b.type='button';b.append(create('span','',tag),document.createTextNode(prompt));b.addEventListener('click',()=>{$('#prompt').value=prompt;$('#prompt').focus();});suggestions.append(b);
   }welcome.append(suggestions);area.append(welcome);return;
 }
 for(const message of chat.messages)area.append(renderMessage(message));
}
function render(){renderSidebar();renderMessages();$('#conversation-title').textContent=activeChat()?.title||'Nova conversa';
  $$('[data-mode]').forEach(b=>b.classList.toggle('selected',b.dataset.mode===state.mode));
  $('#mode-caption').textContent=state.mode==='agent'?'Agente ativo':'Conversa simples';
  renderSelectedSkills();
  const busy=Boolean(state.activeRun);$('#busy-indicator').hidden=!busy;$('#send-button').disabled=busy;
  $('#conversation-scroll').scrollTop=$('#conversation-scroll').scrollHeight;
}
async function request(path,options={}){
 const response=await fetch(path,{cache:'no-store',...options});let payload;
 try{payload=await response.json();}catch{throw Error('Resposta do servidor não é JSON válido');}
 if(!response.ok)throw Error(payload?.error||`HTTP ${response.status}`);
 return payload;
}
const post=(path,value)=>request(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
function replyHistory(chat){
 // Run internals, tool transcripts and error notices NEVER become assistant messages.
 const full=chat.messages.filter(m=>!m.pending&&!['failed','cancelled'].includes(m.status) && (m.role==='user'||m.role==='assistant'));
 const selected=[];let size=0;
 for(const m of full.slice(-24).reverse()){
   if(m.content.length>5000||size+m.content.length>41000)break;
   selected.unshift({role:m.role,content:m.content});size+=m.content.length;
 }
 return selected;
}
function selectedSkills(chat=activeChat()){
 return (chat?.skillIds||[]).map(id=>state.skills.find(skill=>skill.id===id)).filter(Boolean);
}
function renderSelectedSkills(){
 const target=$('#selected-skills');if(!target)return;target.replaceChildren();
 const chat=activeChat(),skills=selectedSkills(chat);$('#skills-count').textContent=String(skills.length);
 if(!skills.length){target.hidden=true;return;}target.hidden=false;
 for(const skill of skills){const chip=create('span','selected-skill-chip');chip.append(create('span','',skill.name));
  const remove=create('button','skill-chip-remove','×');remove.type='button';remove.title=`Remover ${skill.name} desta conversa`;remove.setAttribute('aria-label',remove.title);
  remove.addEventListener('click',()=>{chat.skillIds=chat.skillIds.filter(id=>id!==skill.id);persist();renderSelectedSkills();});chip.append(remove);target.append(chip);
 }
}
async function loadSkills(){
 try{const data=await request('/api/skills');state.skills=Array.isArray(data.skills)?data.skills:[];state.skillsLoaded=true;renderSelectedSkills();}
 catch(error){state.skillsLoaded=false;state.skillsError=error.message;renderSelectedSkills();}
}
function openSkills(){
 openDrawer('skills','Skills da conversa');const body=$('#drawer-body'),chat=activeChat();
 body.append(p('Escolha até 3 skills próprias do Harness. A seleção fica salva nesta conversa e pode ser reutilizada em outras. O servidor envia somente o conteúdo das skills selecionadas junto ao contexto do modelo.'));
 if(!chat){body.append(statusBox('Crie uma conversa para selecionar skills.'));return;}
 const status=statusBox(state.skillsLoaded?'Catálogo carregado.':state.skillsError||'Carregando catálogo...');body.append(status);
 const list=create('div','skill-catalog');body.append(list);
 const draw=()=>{
  list.replaceChildren();
  if(!state.skills.length){list.append(p('Nenhuma skill criada ainda. Use “Criar skill” para adicionar a primeira.'));return;}
  for(const skill of state.skills){const row=create('label','skill-option');const checkbox=create('input');checkbox.type='checkbox';checkbox.checked=(chat.skillIds||[]).includes(skill.id);checkbox.disabled=!checkbox.checked&&(chat.skillIds||[]).length>=3;checkbox.addEventListener('change',()=>{
    chat.skillIds=chat.skillIds||[];chat.skillIds=checkbox.checked?[...new Set([...chat.skillIds,skill.id])].slice(0,3):chat.skillIds.filter(id=>id!==skill.id);persist();renderSelectedSkills();draw();
   });
   const info=create('span','skill-option-info');info.append(create('strong','',skill.name),create('small','',skill.description||'Sem descrição'));
   const edit=button('Editar',()=>openSkillEditor(skill));edit.className='skill-edit-button';row.append(checkbox,info,edit);list.append(row);
  }
 };
 draw();body.append(button('Criar skill',()=>openSkillEditor(null),true));
 if(!state.skillsLoaded)void loadSkills().then(()=>{status.textContent=state.skillsLoaded?'Catálogo carregado.':state.skillsError||'Falha ao carregar catálogo.';draw();});
}
async function openSkillEditor(skill){
 openDrawer('skills',skill?'Editar skill':'Criar skill');const body=$('#drawer-body');
 if(skill){
  const loading=statusBox('Carregando instruções da skill...');body.append(loading);
  try{const data=await request(`/api/skills/${encodeURIComponent(skill.id)}`);skill={...skill,...(data.skill||data)};}
  catch(error){loading.textContent=`Não foi possível carregar esta skill: ${error.message}`;body.append(button('Voltar ao catálogo',openSkills));return;}
  body.replaceChildren();
 }
 body.append(p('As instruções são Markdown enviado como texto de contexto. Skills não adicionam ferramentas nem executam scripts.'));
 const name=field('Nome',skill?.name||'');name.input.maxLength=80;name.input.required=true;
 const description=field('Descrição',skill?.description||'');description.input.maxLength=240;
 const instructionsGroup=create('div','form-group');const instructionsLabel=create('label','','Instruções (Markdown)');const instructions=create('textarea','field');instructions.rows=12;instructions.maxLength=32768;instructions.required=true;instructions.spellcheck=false;instructions.placeholder='## Como trabalhar\nDescreva orientações reutilizáveis para o modelo.';instructions.value=skill?.instructions||'';instructionsLabel.append(instructions);instructionsGroup.append(instructionsLabel);
 const result=statusBox('');body.append(name.group,description.group,instructionsGroup,create('div','skill-char-count',`${instructions.value.length} / 32768 caracteres`),result);
 instructions.addEventListener('input',()=>{$('.skill-char-count',body).textContent=`${instructions.value.length} / 32768 caracteres`;});
 body.append(create('div','action-row'));
 const save=button(skill?'Salvar alterações':'Criar skill',async()=>{
  const payload={name:name.input.value.trim(),description:description.input.value.trim(),instructions:instructions.value.trim()};
  if(!payload.name||!payload.instructions){result.textContent='Informe o nome e as instruções da skill.';return;}
  save.disabled=true;result.textContent='Salvando...';
  try{const saved=skill?await request(`/api/skills/${encodeURIComponent(skill.id)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}):await post('/api/skills',payload);
   const value=saved.skill||saved;if(!value?.id)throw Error('Servidor não retornou o ID da skill');
   state.skills=[...state.skills.filter(item=>item.id!==value.id),value].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
   if(!skill){const chat=activeChat();chat.skillIds=chat.skillIds||[];if(chat.skillIds.length<3)chat.skillIds.push(value.id);}
   persist();renderSelectedSkills();openSkills();
  }catch(error){result.textContent=error.message||String(error);save.disabled=false;}
 });
 $('.action-row',body).append(save,button('Cancelar',openSkills));
}
let skillSlashIndex=0;
function skillSlashOpen(){return !$('#skill-slash-menu').hidden;}
function setSkillSlashIndex(index){
 const items=$$('#skill-slash-menu [data-skill-action]');skillSlashIndex=(index+items.length)%items.length;
 items.forEach((item,i)=>item.setAttribute('aria-selected',String(i===skillSlashIndex)));
}
function openSkillSlashMenu(){
 const menu=$('#skill-slash-menu');menu.hidden=false;$('#prompt').setAttribute('aria-expanded','true');setSkillSlashIndex(0);
}
function closeSkillSlashMenu(){
 $('#skill-slash-menu').hidden=true;$('#prompt').setAttribute('aria-expanded','false');skillSlashIndex=0;
}
function activateSkillSlashAction(){
 const action=$$('#skill-slash-menu [data-skill-action]')[skillSlashIndex]?.dataset.skillAction;closeSkillSlashMenu();
 if(action==='select')openSkills();else openSkillEditor(null);
}
async function sendMessage(){
 const chat=activeChat(),attached=state.pendingAttachments||[];const text=$('#prompt').value.trim()||(attached.length?'Analise os anexos enviados.':'');if(!chat||!text||state.activeRun)return;
 if(text.length>5000)return;
 const history=replyHistory(chat);
 chat.messages.push({role:'user',content:text,attachments:attached.map(item=>({name:item.descriptor.name,mimeType:item.descriptor.mimeType,size:item.descriptor.size,sha256:item.sha256,previewUrl:item.previewUrl}))});
 if(chat.title==='Nova conversa')chat.title=text.length>41?text.slice(0,41)+'…':text;
 $('#prompt').value='';$('#prompt').style.height='auto';
 const answer={role:'assistant',content:'',pending:true,status:'running',runId:null};chat.messages.push(answer);
 state.activeRun={chatId:chat.id,answer,id:null};persist();render();
 try{
   const data=await post('/api/runs',{task:text,model:state.model,key:state.key,mode:state.mode,history,skillIds:[...(chat.skillIds||[])],attachments:attached.map(item=>item.descriptor)});
   state.pendingAttachments=[];renderPendingAttachments();
   if(!data?.id)throw Error('Servidor não retornou um ID de execução');
   answer.runId=data.id;state.activeRun.id=data.id;persist();render();attachRun(data.id,answer);
 }catch(error){answer.pending=false;answer.status='failed';answer.content=error.message||String(error);state.activeRun=null;persist();render();}
}
function closeStream(){state.stream?.close();state.stream=null;}
function attachRun(id,answer){
 closeStream();const stream=new EventSource(`/api/runs/${encodeURIComponent(id)}/events`);state.stream=stream;
 stream.onmessage=event=>{
   let data;try{data=JSON.parse(event.data);}catch{return;}
   answer.events=answer.events||[];if(!answer.events.some(e=>e.id===data.id))answer.events.push(data);
   renderMessages();
   if(data.type==='tool_start')$('#busy-text').textContent=`Ferramenta: ${data.tool}`;
   else if(data.type==='thinking')$('#busy-text').textContent='O agente está raciocinando';
   if(data.type==='complete'){closeStream();void completeRun(id,answer);}
 };
 // On transient disconnect, ask the run endpoint for the authoritative final state.
 stream.onerror=()=>{closeStream();setTimeout(()=>void completeRun(id,answer,true),1100);};
}
async function completeRun(id,answer,reconnect=false){
 try{
  const run=await request(`/api/runs/${id}`);
  if(run.status==='running'){
   if(reconnect && state.activeRun?.id===id)attachRun(id,answer);
   return;
  }
  answer.pending=false;answer.status=run.status;answer.verification=run.verification;
  answer.content=run.answer||'Execução encerrada sem resposta.';answer.calls=run.calls||0;
  answer.artifacts=Array.isArray(run.artifacts)?run.artifacts:[];
  answer.events=Array.isArray(run.events)?run.events:answer.events||[];
  if(state.activeRun?.id===id)state.activeRun=null;
  persist();render();
 }catch(error){
  answer.pending=false;answer.status='failed';
  answer.content=reconnect?`Não foi possível recuperar a execução: ${error.message}`:'Execução encerrada: o servidor reiniciou ou não mantém mais este registro. Envie a mensagem novamente.';
  if(state.activeRun?.id===id)state.activeRun=null;
  persist();render();
 }
}
async function stopRun(){if(!state.activeRun?.id)return;try{await post(`/api/runs/${state.activeRun.id}/cancel`,{});closeStream();await completeRun(state.activeRun.id,state.activeRun.answer);}catch(error){$('#busy-text').textContent=error.message;}}
function openDrawer(kind,title){clearInterval(state.traceTimer);state.traceTimer=null;state.openPanel=kind;$('#drawer-eyebrow').textContent='HARNESS / '+kind.toUpperCase();$('#drawer-title').textContent=title;$('#drawer-overlay').hidden=false;$('#drawer').classList.add('open');$('#drawer').setAttribute('aria-hidden','false');$('#drawer-body').replaceChildren();}
function closeDrawer(){clearInterval(state.traceTimer);state.traceTimer=null;state.openPanel='';$('#drawer-overlay').hidden=true;$('#drawer').classList.remove('open');$('#drawer').setAttribute('aria-hidden','true');}
const section=(text)=>create('div','section-title',text);
function field(label,value,type='text'){
 const group=create('div','form-group');const lab=create('label','',label);const input=create('input','field');input.type=type;input.value=value;lab.append(input);group.append(lab);return {group,input};
}
const p=(text)=>create('p','help',text);
function button(text,handler,primary=false){const b=create('button',primary?'primary-button':'secondary-button',text);b.type='button';b.addEventListener('click',handler);return b;}
function statusBox(text='—'){return create('div','status-box',text);}
function openSettings(){
 openDrawer('settings','Configurações');const body=$('#drawer-body');body.append(section('CONEXÃO'),p('Chave guardada no backend por meio de .env. Se informada aqui, será usada apenas nesta aba e não será salva no navegador.'));
 const model=field('Modelo NVIDIA (ID)',state.model);model.input.maxLength=140;body.append(model.group);
 const key=field('Chave temporária NVIDIA (opcional)',state.key,'password');key.input.autocomplete='off';body.append(key.group);
 const result=statusBox('Diagnóstico ainda não executado.');
 const save=button('Salvar configurações',()=>{
  const name=model.input.value.trim();if(!/^[-\w./]{1,140}$/.test(name)){result.textContent='ID de modelo inválido';return;}
  state.model=name;state.modelIsSaved=true;state.key=key.input.value.trim();persist();result.textContent='Configurações aplicadas nesta sessão. A chave não foi persistida.';
 },true);
 const probe=button('Testar NVIDIA',async()=>{
  result.textContent='Testando conexão...';try{const v=await post('/api/nvidia/probe',{model:model.input.value.trim(),key:key.input.value.trim()});result.textContent=JSON.stringify(v,null,2);}catch(e){result.textContent=e.message;}
 });
 const doctor=button('Testar Python / Lean / Node',async()=>{
  result.textContent='Executando diagnóstico...';try{const v=await post('/api/doctor/check',{});result.textContent=(v.checks||[]).map(c=>`${c.ok?'✓':'✕'} ${c.name}: ${c.output}`).join('\n\n');}catch(e){result.textContent=e.message;}
 });
 const actions=create('div','action-row');actions.append(save,probe,doctor);body.append(actions,result,section('SEGURANÇA'),p('Execução por Docker Compose sem acesso à rede do executor. O modelo nunca recebe a chave dentro do workspace. Este aplicativo deve permanecer restrito a 127.0.0.1.'),section('LEAN + MATHLIB'),p('Lean 4 pode ser verificado pela ferramenta do agente. Para Mathlib, execute setup-mathlib.ps1 ou setup-mathlib.sh após preparar Docker.'));
}
async function openFiles(){
 openDrawer('files','Arquivos do workspace');const body=$('#drawer-body');body.append(p('Explore o workspace que o agente pode ler e editar. Alterações feitas pelo agente têm revisão e trilha de auditoria.'));
 const list=create('div');body.append(list);list.append(statusBox('Carregando arquivos...'));
 try{
  const response=await request('/api/files');list.replaceChildren();
  for(const file of response.files||[]){
   const b=button(String(file),async()=>{
    view.replaceChildren(statusBox('Carregando...'));
    try{const v=await request(`/api/file?path=${encodeURIComponent(file)}`);view.replaceChildren(section(file),create('pre','file-content',v.content));
    if(file.endsWith('.html')){view.append(button('Pré-visualizar HTML',()=>{view.append(create('iframe','preview-frame'));const frame=$('.preview-frame',view);frame.setAttribute('sandbox','allow-scripts');frame.src=`/preview/${encodeURIComponent(file)}`;}));}
    }catch(e){view.replaceChildren(statusBox(e.message));}
   });b.className='file-item';list.append(b);
  }
 }catch(e){list.replaceChildren(statusBox(e.message));}
 const view=create('div');body.append(view,section('PROVAS FORMAIS'),p('O agente também pode criar provas em proofs/ e verificar com lean_core, sem sorry/admit.'));
 body.append(button('Verificador Lean 4 avulso',openLean));
}
async function openLean(){
 openDrawer('lean','Verificar prova Lean 4');const body=$('#drawer-body');body.append(p('Execute uma prova diretamente no Lean 4. O resultado valida somente o enunciado formalizado.'));
 const source=create('textarea','field');source.rows=12;source.spellcheck=false;source.value='theorem identity (p : Prop) : p → p := by\n  intro h\n  exact h';
 const mode=create('select','field');for(const m of ['core','mathlib']){const o=create('option','',m==='core'?'Lean 4 Core':'Lean 4 + Mathlib');o.value=m;mode.append(o);}
 const result=statusBox('Aguardando verificação.');
 body.append(section('CÓDIGO'),source,section('AMBIENTE'),mode);
 body.append(create('div','action-row'));const controls=$('.action-row',body);
 controls.append(button('Verificar prova',async()=>{result.textContent='Executando Lean...';try{const v=await post('/api/lean/check',{source:source.value,mode:mode.value});result.textContent=(v.passed?'✓ Prova aceita pelo compilador\n':'✕ Prova não verificada\n')+(v.output||v.reason||'');}catch(e){result.textContent=e.message;}},true));
 body.append(result);
}
async function openActivity(runId){
 const id=runId||activeChat()?.messages.slice().reverse().find(m=>m.runId)?.runId;
 openDrawer('trace','Atividade e evidências');const body=$('#drawer-body');
 if(!id){body.append(statusBox('Nenhuma execução nesta conversa.'));return;}
 body.append(p('Atividade observável em tempo real. As seções abaixo mostram os payloads e saídas usados pela execução; prompts e arquivos podem conter conteúdo sensível. O Harness remove campos de raciocínio privado e credenciais.'));
 const report=statusBox('Carregando...'),content=create('div','trace-content');body.append(report,content);
 const rawDetails=(title,value,scope)=>{const d=create('details','trace-raw');d.dataset.traceKey=scope;const summary=create('summary','',title);d.append(summary);const pre=create('pre','trace-code',JSON.stringify(value,null,2));d.append(pre);const copy=button('Copiar JSON',async()=>{try{await navigator.clipboard.writeText(JSON.stringify(value,null,2));copy.textContent='Copiado';}catch{copy.textContent='Cópia indisponível';}});d.append(copy);return d;};
 const refresh=async()=>{
  try{
   const [run,trace]=await Promise.all([request(`/api/runs/${id}`),request(`/api/runs/${id}/trace`)]);
   if(state.openPanel!=='trace')return;
   report.textContent=`Estado: ${run.status}\nModelo: ${run.model}\nModo: ${trace.run?.mode}\nTurnos: ${trace.modelRequests?.length||0} · Ferramentas: ${run.calls}\nTokens: ${run.usage?.prompt||0} entrada / ${run.usage?.completion||0} saída\nVerificação: ${run.verification}\nTrace: esquema ${trace.schemaVersion}`;
   content.replaceChildren();
   const actions=create('div','action-row');actions.append(button('Exportar JSON completo',()=>{window.location.href=`/api/runs/${id}/export`;}));content.append(actions);
   content.append(rawDetails(`Agente real (${trace.participants?.length||0})`,trace.participants||[],'participants'));
   if(trace.skills?.length)content.append(rawDetails(`Skills selecionadas (${trace.skills.length})`,trace.skills,'skills'));
   for(const requestTrace of trace.modelRequests||[]){
    const turn=create('details','trace-turn');const title=create('summary','',`Turno ${requestTrace.turn} · ${requestTrace.attempts?.length||0} tentativa(s)`);turn.append(title);
    for(const [index,attempt] of (requestTrace.attempts||[]).entries()){
     const attemptBox=create('div','trace-attempt');attemptBox.append(create('h4','','Tentativa '+(index+1)+(attempt.httpStatus?` · HTTP ${attempt.httpStatus}`:'')+(attempt.retryCategory?` · retry ${attempt.retryCategory}`:'')));
     attemptBox.append(rawDetails('Payload JSON exato enviado ao NVIDIA',attempt.requestPayload,`request:${requestTrace.requestId}:${index}`));
     if(attempt.response)attemptBox.append(rawDetails('Resposta observável (sem campos privados)',attempt.response,`response:${requestTrace.requestId}:${index}`));
     if(attempt.error)attemptBox.append(create('pre','trace-code',attempt.error));turn.append(attemptBox);
    }
    content.append(turn);
   }
   if(trace.toolCalls?.length){const toolsBox=create('details','trace-turn');toolsBox.append(create('summary','','Chamadas de ferramentas ('+trace.toolCalls.length+')'));for(const call of trace.toolCalls){const group=create('details','trace-raw');group.append(create('summary','',`${call.tool} · ${call.status} · ${call.durationMs} ms · ${call.callId}`));group.append(rawDetails('Argumentos enviados',call.argumentsRaw,`args:${call.callId}`),rawDetails('Resultado da execução',call.result,`result:${call.callId}`),rawDetails('Resultado enviado no próximo turno',call.resultSentToModel,`sent:${call.callId}`));toolsBox.append(group);}content.append(toolsBox);}
   if(trace.attachments?.length)content.append(rawDetails(`Anexos de entrada (${trace.attachments.length})`,trace.attachments,'attachments'));
   if(trace.artifacts?.length){const artifacts=create('details','trace-turn');artifacts.open=true;artifacts.append(create('summary','','Arquivos produzidos ('+trace.artifacts.length+')'));for(const item of trace.artifacts){const card=create('div','artifact-card');if(item.mimeType.startsWith('image/')){const img=create('img','artifact-preview');img.src=`/api/runs/${id}/artifacts/${item.id}`;img.alt=item.name;card.append(img);}const link=create('a','artifact-download',`${item.name} · ${item.size} bytes`);link.href=`/api/runs/${id}/artifacts/${item.id}`;link.download=item.name;card.append(link,create('small','',`SHA-256 ${item.sha256}`));artifacts.append(card);}content.append(artifacts);}
   content.append(section('LINHA DO TEMPO'));const cards=activityCards(run.events||[],run.status==='running');for(let i=0;i<cards.length;i++)content.append(activityEntry(cards[i],run.status==='running'&&i===cards.length-1&&Boolean(cards[i].active),`drawer:${id}`));
   if(run.status!=='running'){clearInterval(state.traceTimer);state.traceTimer=null;}
   const chat=activeChat();const answer=chat?.messages.find(m=>m.runId===id);if(answer){answer.events=Array.isArray(run.events)?run.events:[];answer.artifacts=trace.artifacts||[];renderMessages();}
  }catch(e){report.textContent=(e.message||String(e))+'\nTrilhas antigas existem somente enquanto o servidor permanece ativo.';}
 };
 state.traceTimer=setInterval(()=>void refresh(),runId&&state.activeRun?.id===id?700:1500);await refresh();
}
async function refreshHealth(){try{const d=await request('/api/health');state.health=d;if(!state.modelIsSaved&&typeof d.model==='string'&&d.model.trim())state.model=d.model.trim();const ready=d.runner?.available===true;$('#health-dot').className='status-dot '+(ready?'ok':'bad');$('#health-text').textContent=ready?'Executor conectado':'Executor indisponível';}catch{$('#health-dot').className='status-dot bad';$('#health-text').textContent='Servidor indisponível';}}
async function restorePending(){
 const chat=activeChat();const m=chat?.messages.slice().reverse().find(m=>m.pending&&m.runId);
 if(!m)return;
 state.activeRun={chatId:chat.id,answer:m,id:m.runId};render();
 await completeRun(m.runId,m,true);
}
function setup(){
 if(!activeChat())newChat();else render();
 $('#new-chat').addEventListener('click',newChat);
 $('#files-button').addEventListener('click',()=>void openFiles());$('#settings-button').addEventListener('click',openSettings);
 $('#activity-button').addEventListener('click',()=>void openActivity());$('#drawer-close').addEventListener('click',closeDrawer);$('#drawer-overlay').addEventListener('click',closeDrawer);
 $('#skills-button').addEventListener('click',openSkills);$('#create-skill-button').addEventListener('click',()=>openSkillEditor(null));
 $('#attach-button').addEventListener('click',()=>$('#attachments-input').click());$('#attachments-input').addEventListener('change',e=>{void addAttachments([...e.currentTarget.files||[]]);e.currentTarget.value='';});
 $('#mobile-menu').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
 $$('[data-mode]').forEach(b=>b.addEventListener('click',()=>{state.mode=b.dataset.mode;persist();render();}));
 $('#composer').addEventListener('submit',e=>{e.preventDefault();void sendMessage();});
 $$('[data-format]').forEach(button=>button.addEventListener('click',()=>formatSelection(button.dataset.format)));
 $('#prompt').addEventListener('keydown',e=>{
  if(skillSlashOpen()){
   if(e.key==='Escape'){e.preventDefault();closeSkillSlashMenu();return;}
   if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setSkillSlashIndex(skillSlashIndex+(e.key==='ArrowDown'?1:-1));return;}
   if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();activateSkillSlashAction();return;}
   if(e.key.length===1||e.key==='Backspace'||e.key==='Delete')closeSkillSlashMenu();
  }
  if(e.key==='/'&&e.currentTarget.value.length===0&&e.currentTarget.selectionStart===0&&e.currentTarget.selectionEnd===0){e.preventDefault();openSkillSlashMenu();return;}
  if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();void sendMessage();}
 });
 $$('#skill-slash-menu [data-skill-action]').forEach((item,index)=>item.addEventListener('pointerenter',()=>setSkillSlashIndex(index)));
 $$('#skill-slash-menu [data-skill-action]').forEach(item=>item.addEventListener('click',()=>{skillSlashIndex=$$('#skill-slash-menu [data-skill-action]').indexOf(item);activateSkillSlashAction();}));
 document.addEventListener('pointerdown',e=>{if(skillSlashOpen()&&!$('#composer').contains(e.target))closeSkillSlashMenu();});
 $('#prompt').addEventListener('input',e=>{e.currentTarget.style.height='auto';e.currentTarget.style.height=Math.min(170,e.currentTarget.scrollHeight)+'px';});
 $('#stop-button').addEventListener('click',()=>void stopRun());
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer();if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();newChat();}});
 void refreshHealth();void restorePending();void loadSkills();
}
const TEXT_MIME_BY_EXT={txt:'text/plain',log:'text/plain',md:'text/markdown',markdown:'text/markdown',csv:'text/csv',json:'application/json',js:'text/javascript',mjs:'text/javascript',cjs:'text/javascript',ts:'application/typescript',tsx:'application/typescript',html:'text/html',htm:'text/html',css:'text/css',xml:'application/xml',py:'text/x-python',java:'text/x-java-source',c:'text/x-c',h:'text/x-c',cc:'text/x-c++',cpp:'text/x-c++',hpp:'text/x-c++',rs:'text/x-rust',go:'text/x-go',sh:'text/x-shellscript',bash:'text/x-shellscript',yaml:'text/x-yaml',yml:'text/x-yaml'};
function renderPendingAttachments(){
 const area=$('#pending-attachments');if(!area)return;area.replaceChildren();const items=state.pendingAttachments||[];area.hidden=!items.length;
 for(const [index,item] of items.entries()){const card=create('div','pending-attachment');if(item.previewUrl){const image=create('img','attachment-preview');image.src=item.previewUrl;image.alt=item.descriptor.name;card.append(image);}const label=create('span','',`${item.descriptor.name} · ${Math.ceil(item.descriptor.size/1024)} KB`);const remove=button('×',()=>{URL.revokeObjectURL(item.previewUrl||'');state.pendingAttachments.splice(index,1);renderPendingAttachments();});remove.setAttribute('aria-label',`Remover ${item.descriptor.name}`);card.append(label,remove);area.append(card);}
}
function readFile(file,mode){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error(`Não foi possível ler ${file.name}`));reader.onload=()=>resolve(reader.result);mode==='dataurl'?reader.readAsDataURL(file):reader.readAsText(file);});}
async function addAttachments(files){
 const area=$('#pending-attachments'),items=state.pendingAttachments;let imageCount=items.filter(x=>x.descriptor.base64).length,imageBytes=items.filter(x=>x.descriptor.base64).reduce((n,x)=>n+x.descriptor.size,0),textBytes=items.filter(x=>x.descriptor.text!==undefined).reduce((n,x)=>n+new TextEncoder().encode(x.descriptor.text).length,0);
 try{for(const file of files){if(items.length>=12)throw Error('São permitidos até 12 anexos por mensagem.');const ext=file.name.split('.').pop()?.toLowerCase()||'';let descriptor,previewUrl='';
  if(['image/png','image/jpeg','image/webp'].includes(file.type)){
   if(state.model!=='z-ai/glm-5.3-flash')throw Error('Imagens exigem o modelo z-ai/glm-5.3-flash. Selecione esse modelo nas configurações.');
   if(file.size>4*1024*1024||imageBytes+file.size>8*1024*1024||imageCount>=8)throw Error('Limite de imagens: 8 imagens, 4 MiB por imagem e 8 MiB no total.');
   const data=await readFile(file,'dataurl');descriptor={name:file.name,mimeType:file.type,base64:String(data).split(',')[1]};previewUrl=URL.createObjectURL(file);imageCount++;imageBytes+=file.size;
  }else{
   const mime=TEXT_MIME_BY_EXT[ext];if(!mime||file.size>256*1024||textBytes+file.size>512*1024)throw Error(`Arquivo ${file.name} não é permitido ou excede os limites de texto.`);
   const content=String(await readFile(file,'text'));textBytes+=new TextEncoder().encode(content).length;if(textBytes>512*1024)throw Error('Arquivos textuais excedem 512 KiB no total.');descriptor={name:file.name,mimeType:mime,text:content};
  }
  const fingerprint=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());const sha256=[...new Uint8Array(fingerprint)].map(b=>b.toString(16).padStart(2,'0')).join('');items.push({descriptor,previewUrl,sha256});
 }
 renderPendingAttachments();
 }catch(error){if(area){area.hidden=false;const note=create('div','attachment-error',error.message||String(error));area.append(note);}}
}
function formatSelection(kind){
 const input=$('#prompt'),start=input.selectionStart,end=input.selectionEnd,selected=input.value.slice(start,end);let before='',after='',replacement;
 if(kind==='list'){const lineStart=input.value.lastIndexOf('\n',Math.max(0,start-1))+1;const lineEnd=input.value.indexOf('\n',end);const finish=lineEnd<0?input.value.length:lineEnd;const block=input.value.slice(lineStart,finish);const formatted=block.split('\n').map(line=>line?`- ${line}`:'- ').join('\n');input.setRangeText(formatted,lineStart,finish,'select');input.focus();input.dispatchEvent(new Event('input',{bubbles:true}));return;}
 if(kind==='bold'){before='**';after='**';}else if(kind==='italic'){before='*';after='*';}else if(kind==='code'){before='`';after='`';}else if(kind==='math'){before='$';after='$';}else if(kind==='math-block'){before='$$\n';after='\n$$';}
 replacement=before+(selected||'texto')+after;input.setRangeText(replacement,start,end,'select');input.focus();input.setSelectionRange(start+before.length,start+before.length+(selected||'texto').length);input.dispatchEvent(new Event('input',{bubbles:true}));
}
setup();
