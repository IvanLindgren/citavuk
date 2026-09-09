import {readFileSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import ts from 'typescript';
import {expect,it} from 'vitest';

// Смотрим синтаксические текстовые узлы, не комментарии или учебные документы.
// Направление в кнопках задаётся SVG-иконкой, а не символом из шрифта.
it('в интерфейсе нет текстовых стрелок',()=>{
 const root=resolve(process.cwd(),'src');
 const found:string[]=[];
 const arrows=/[←→↗↘↙↖⇒⇐⟶⟵➜➝➞➔⮕➡⬅↑↓↔↕]|&(?:rarr|larr|uarr|darr|harr);/u;
 const scan=(dir:string)=>{
  for(const e of readdirSync(dir,{withFileTypes:true})){
   const file=join(dir,e.name);if(e.isDirectory()){scan(file);continue;}
   if(!e.name.endsWith('.tsx')||e.name.includes('.test.'))continue;
   const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
   const visit=(node:ts.Node)=>{
    if((ts.isJsxText(node)||ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))&&arrows.test(node.text)){
     found.push(`${file}:${source.getLineAndCharacterOfPosition(node.pos).line+1}`);
    }
    ts.forEachChild(node,visit);
   };
   visit(source);
  }
 };
 for(const dir of ['pages','components'])scan(join(root,dir));
 expect(found).toEqual([]);
});
