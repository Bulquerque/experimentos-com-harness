import type {Fn} from './types.ts';
import {explore,inspect,changeBatch,previewProject} from './workspace.ts';
import type {Change} from './workspace.ts';
import {runSandbox,verifyChecks} from './runner.ts';
import type {Check} from './runner.ts';

const string=(description:string)=>({type:'string',description});
const number=(description:string)=>({type:'integer',description});
const schema=(properties:Record<string,unknown>,required:string[]=[])=>( {type:'object',additionalProperties:false,properties,required});
export const tools:Fn[]=[
 {name:'orient',description:'Entenda o projeto: árvore compacta se query estiver vazio; busca nomes e conteúdo se query existir. Não devolve arquivos enormes.',parameters:schema({query:string('Termo opcional'),limit:number('Máximo de resultados, 1-100')})},
 {name:'inspect',description:'Leia um trecho numerado de arquivo; retorna hash SHA-256 para controle de versão. Use antes de editar.',parameters:schema({path:string('Caminho relativo ao workspace'),start_line:number('Linha inicial, base 1'),limit:number('Número de linhas até 160')},['path'])},
 {name:'transform',description:'Crie ou edite até 8 arquivos em transação. Replaces exigem old_text exclusivo; expected_hash é recomendado. dry_run permite visualizar antes da alteração.',parameters:schema({dry_run:{type:'boolean',description:'true = somente prévia'},actions:{type:'array',minItems:1,maxItems:8,items:schema({op:{type:'string',enum:['create','replace']},path:string('Arquivo relativo'),content:string('Conteúdo novo para create'),old_text:string('Trecho exato antes da substituição'),new_text:string('Trecho novo'),expected_hash:string('Hash SHA-256 da última leitura, quando disponível')},['op','path'])}},['actions'])},
 {name:'execute',description:'Execute em cópia descartável do workspace, no Docker isolado e sem rede; use transform para persistir mudanças. Não use o código de saída como prova universal de conclusão.',parameters:schema({command:string('Comando para o shell isolado'),runtime:{type:'string',enum:['node','python','lean']},timeout_seconds:number('Limite 3-45 segundos')},['command'])},
 {name:'verify',description:'Execute verificações independentes e receba evidências estruturadas. Use antes de concluir; escopo da verificação deve ser comunicado.',parameters:schema({checks:{type:'array',items:{type:'string',enum:['node_tests','npm_test','npm_build','python_tests','python_compile','node_syntax','lean_core','mathlib_build','web_assets','web_script_syntax']},description:'Opcional; vazio faz detecção automática'}})},
 {name:'preview',description:'Prepare visualização segura de um site HTML criado no workspace; retorna endereço de prévia, arquivos e avisos. Só informe êxito visual quando o usuário realmente inspecionar o site.',parameters:schema({entry:string('Página HTML relativa ao workspace, ex: index.html')},['entry'])}
];
function asText(v:unknown,name:string){if(typeof v!=='string')throw new Error(`Argumento ${name} precisa ser texto`);return v;}
function asInt(v:unknown,fallback:number){const n=Number(v);return Number.isFinite(n)?n:fallback;}
export async function execTool(name:string,args:Record<string,unknown>,signal:AbortSignal):Promise<string>{
 let result:unknown;
 switch(name){
  case 'orient':result=await explore(typeof args.query==='string'?args.query:'',asInt(args.limit,90));break;
  case 'inspect':result=await inspect(asText(args.path,'path'),asInt(args.start_line,1),asInt(args.limit,100));break;
  case 'transform':result=await changeBatch(args.actions as Change[],args.dry_run===true);break;
  case 'execute':if(args.runtime!==undefined&&!['node','python','lean'].includes(String(args.runtime)))throw new Error('Runtime inválido: use node, python ou lean');result=await runSandbox(asText(args.command,'command'),signal,(args.runtime||'node') as 'node'|'python'|'lean',asInt(args.timeout_seconds,25),true);break;
  case 'verify':result=await verifyChecks(args.checks as Check[]|undefined,signal);break;
  case 'preview':result=await previewProject(asText(args.entry,'entry'));break;
  default:throw new Error(`Ferramenta desconhecida: ${name}`);
 }
 return JSON.stringify(result);
}
