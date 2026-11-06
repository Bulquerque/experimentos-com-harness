/** Trust boundary for history passed by the browser.
 * Previous turns are conversational context, NEVER system messages or tool results. */
import type {AgentMode,ChatMessage} from './types.ts';

export function parseChatRequest(input:Record<string,unknown>):{history:ChatMessage[];mode:AgentMode;skillIds:string[]}{
 const mode=input.mode===undefined?'agent':input.mode;
 if(mode!=='agent'&&mode!=='chat')throw new Error('Modo inválido: use agent ou chat');
 const raw=input.history??[];
 if(!Array.isArray(raw)||raw.length>24)throw new Error('Histórico inválido: máximo 24 mensagens');
 const history:ChatMessage[]=[];
 let size=0;
 for(const item of raw){
  if(!item||typeof item!=='object'||Array.isArray(item))throw new Error('Mensagem do histórico inválida');
  const m=item as Record<string,unknown>;
  if((m.role!=='user'&&m.role!=='assistant')||typeof m.content!=='string'||!m.content.trim()||m.content.length>5000)
   throw new Error('Histórico permite somente mensagens user/assistant com até 5000 caracteres');
  // Reject fields that would permit a forged tool call, extra system instruction or tool output.
  if(Object.keys(m).some(key=>key!=='role'&&key!=='content'))throw new Error('Campos extras no histórico não são permitidos');
  size+=m.content.length;
  if(size>42000)throw new Error('Histórico excede 42 mil caracteres');
  history.push({role:m.role,content:m.content});
 }
 const rawSkills=input.skillIds??[];
 if(!Array.isArray(rawSkills)||rawSkills.length>3||rawSkills.some(id=>typeof id!=='string'||!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id))||new Set(rawSkills).size!==rawSkills.length)throw new Error('Seleção de skills inválida: use até 3 IDs únicos');
 return {history,mode,skillIds:rawSkills as string[]};
}
