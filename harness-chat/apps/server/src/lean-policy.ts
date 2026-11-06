/** Lightweight, conservative preflight for proof holes and local axioms.
 * This is defense-in-depth, NOT a substitute for Lean's kernel or an axiom audit.
 */
export function leanCodeOnly(source:string):string{
 let out='',depth=0,inLine=false,inString=false;
 for(let i=0;i<source.length;i++){
  const c=source[i],n=source[i+1]||'';
  if(inLine){if(c==='\n'){inLine=false;out+='\n';}else out+=' ';continue;}
  if(depth>0){
   if(c==='/'&&n==='-'){depth++;out+='  ';i++;continue;}
   if(c==='-'&&n==='/'){depth--;out+='  ';i++;continue;}
   out+=c==='\n'?'\n':' ';continue;
  }
  if(inString){
   if(c==='\\'&&n){out+='  ';i++;continue;}
   if(c==='"')inString=false;
   out+=c==='\n'?'\n':' ';continue;
  }
  if(c==='-'&&n==='-'){inLine=true;out+='  ';i++;continue;}
  if(c==='/'&&n==='-'){depth=1;out+='  ';i++;continue;}
  if(c==='"'){inString=true;out+=' ';continue;}
  out+=c;
 }
 return out;
}
export function leanPolicyIssues(source:string):string[]{
 const code=leanCodeOnly(source);
 const violations:[RegExp,string][]=[
  [/\b(?:sorry|admit|sorryAx)\b/g,'Prova incompleta ou admissão de axioma (sorry/admit/sorryAx)'],
  [/(?:^|\n)\s*(?:(?:private|protected|noncomputable)\s+)*(?:axiom|constant|opaque)\b/gm,'Declaração local axiom/constant/opaque não permitida no modo de prova estrita'],
  [/\b(?:native_decide)\b/g,'native_decide fora do perfil de verificação estrita']
 ];
 return violations.filter(([pattern])=>pattern.test(code)).map(([,message])=>message);
}
export function assertLeanPolicy(source:string):void{
 const issues=leanPolicyIssues(source);
 if(issues.length)throw new Error(issues.join('; '));
}
