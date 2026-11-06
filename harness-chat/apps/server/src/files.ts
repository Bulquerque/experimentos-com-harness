// Backwards-compatible exports for UI endpoints/tests.
export {ROOT,safePath,checkedPath,listFiles,replaceUnique} from './workspace.ts';
import {inspect,explore,changeBatch} from './workspace.ts';
export async function readFile(path:string,start=1,count=120){return (await inspect(path,start,count)).content;}
export async function writeFile(path:string,content:string){return JSON.stringify(await changeBatch([{op:'create',path,content}]));}
export async function editFile(path:string,before:string,after:string){return JSON.stringify(await changeBatch([{op:'replace',path,old_text:before,new_text:after}]));}
export async function searchCode(query:string){return JSON.stringify(await explore(query,70));}
