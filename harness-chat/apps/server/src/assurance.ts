/** Deterministic evidence coverage, independent of what the LLM says. */
export type CheckName = 'node_tests'|'npm_test'|'npm_build'|'python_tests'|'python_compile'|'node_syntax'|'lean_core'|'mathlib_build'|'web_assets'|'web_script_syntax';
export type Coverage = {
  changed_files:string[];
  required_checks:CheckName[];
  passed_checks:string[];
  failed_checks:string[];
  missing_checks:string[];
  uncovered_files:string[];
  scope:string;
};
export function coverageFor(changed:Iterable<string>, passed:Iterable<string>, failed:Iterable<string>, allFiles:string[]):Coverage{
 const changed_files=[...new Set(changed)].sort();
 const required=new Set<CheckName>();const uncovered_files:string[]=[];
 const files=allFiles.map(s=>s.toLowerCase());
 const hasPythonTests=files.some(f=>/(^|\/)test[^/]*\.py$/.test(f));
 const hasNodeTests=files.some(f=>/\.(?:test|spec)\.[cm]?js$/.test(f));
 const hasPackage=files.includes('package.json');
 for(const file of changed_files){
  const name=file.toLowerCase();
  if(name.endsWith('.py')){required.add('python_compile');if(hasPythonTests)required.add('python_tests');}
  else if(/\.(?:js|mjs|cjs)$/.test(name)){required.add('node_syntax');if(hasNodeTests)required.add('node_tests');}
  else if(/\.(?:jsx|ts|tsx)$/.test(name)){if(hasPackage)required.add('npm_build');else uncovered_files.push(file);}
  else if(/\.(?:html|css)$/.test(name)){required.add('web_assets');required.add('web_script_syntax');}
  else if(name.endsWith('.lean')){if(name.startsWith('proofs/mathlib/'))required.add('mathlib_build');else if(name.startsWith('proofs/'))required.add('lean_core');else uncovered_files.push(file);}
  else uncovered_files.push(file);
 }
 const passed_checks=[...new Set(passed)].sort(),failed_checks=[...new Set(failed)].sort();
 const missing_checks=[...required].filter(c=>!passed_checks.includes(c)).sort();
 return {changed_files,required_checks:[...required].sort(),passed_checks,failed_checks,missing_checks,uncovered_files,
  scope:'Checagens técnicas automatizadas. Não atestam requisitos do pedido, comportamento em navegador ou correção matemática geral.'};
}
export function evidencePasses(c:Coverage):boolean{
 return c.passed_checks.length>0&&c.failed_checks.length===0&&c.missing_checks.length===0&&c.uncovered_files.length===0;
}
