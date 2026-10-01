import {expect,it} from 'vitest';
import {paginate,pageForPosition} from './pages';
import {reflowDocumentWithLayout} from './reflow';

it('restores the precise page inside a chapter, including UTF-16 characters',()=>{
 const text='Вук чита књигу поред прозора и размишља о путовању 🐺. '.repeat(100).trim();
 const pages=paginate([text]);expect(pages.length).toBeGreaterThan(3);expect(pageForPosition(pages,0)).toBe(0);
 pages.forEach((page,i)=>{expect(pageForPosition(pages,page.start,page.offset)).toBe(i);expect(text.slice(page.offset??0).startsWith(page.texts[0]!)).toBe(true);});
});
it('keeps wrapped illustration text together on either side of the page',()=>{
 const lines=[{text:'Alisa je sedela pored',left:100,right:250},{text:'svoje sestre i gledala',left:100,right:250},{text:'u knjigu koju je čitala.',left:100,right:250},{text:'Zatim je videla zeca koji je brzo trčao pored njih.',left:100,right:500}];
 expect(reflowDocumentWithLayout([lines])[0]).toBe('Alisa je sedela pored svoje sestre i gledala u knjigu koju je čitala.');
 const shifted=lines.map(l=>({...l,left:l.right===250?300:100,right:500}));
 expect(reflowDocumentWithLayout([shifted]).join(' ')).toBe(lines.map(l=>l.text).join(' '));
});
