// Подготовка скачанных SVG и CC0-частиц: один набор PNG для React и Flutter.
// Никаких генеративных изображений; исходники и лицензии — design/card-assets.
import puppeteer from 'puppeteer';
import {readFile,mkdir,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('..'),sources=path.join(root,'design/card-assets/sources');
const web=path.join(root,'web/public/personal/decor'),native=path.join(root,'frontend/assets/imgs');
await mkdir(web,{recursive:true});
const browser=await puppeteer.launch({headless:true});
try{
 const page=await browser.newPage();
 for(const [file,name,width,height] of [['theatre-frame.svg','engraved-frame',512,768],['ravanica.svg','ravanica-medallion',384,384]]){
  const raw=await readFile(path.join(sources,file),'utf8');
  if(/<script|<foreignObject|\bon\w+\s*=|<!ENTITY/i.test(raw))throw new Error('Недопустимый SVG');
  const result=await page.evaluate(async({raw,name,width,height})=>{
   const doc=new DOMParser().parseFromString(raw.replace(/<!DOCTYPE[^>]*>/g,''),'image/svg+xml');
   if(doc.querySelector('parsererror'))throw new Error('Некорректный SVG');
   for(const e of doc.querySelectorAll('metadata'))e.remove();
   for(const e of doc.querySelectorAll('*'))for(const a of [...e.attributes]){
    if((a.localName==='href')&&!a.value.startsWith('#'))throw new Error('Внешняя ссылка в SVG');
   }
   if(name==='ravanica-medallion'){
    for(const e of doc.querySelectorAll('[fill="#8c949c"],[fill="#5a5d5f"]'))e.remove();
    for(const e of doc.querySelectorAll('[fill="#ffffff"]'))e.setAttribute('fill','#eed399');
    for(const e of doc.querySelectorAll('[fill="#272828"]'))e.setAttribute('fill','#85532e');
   }
   const data='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(new XMLSerializer().serializeToString(doc))));
   let svg=data;
   if(name==='engraved-frame'){
    const body=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><filter id="inverse" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncR type="linear" slope="-1" intercept="1"/><feFuncG type="linear" slope="-1" intercept="1"/><feFuncB type="linear" slope="-1" intercept="1"/></feComponentTransfer></filter><linearGradient id="gold" x2="1" y2="1"><stop stop-color="#966037"/><stop offset=".22" stop-color="#fff0b6"/><stop offset=".48" stop-color="#b98549"/><stop offset=".64" stop-color="#fbe4aa"/><stop offset="1" stop-color="#99613a"/></linearGradient><mask id="ink" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}" style="mask-type:luminance"><g filter="url(#inverse)"><rect width="100%" height="100%" fill="white"/><image href="${data}" width="100%" height="100%" preserveAspectRatio="none"/></g></mask></defs><rect width="100%" height="100%" fill="url(#gold)" mask="url(#ink)"/></svg>`;
    svg='data:image/svg+xml;base64,'+btoa(body);
   }
   const image=new Image();image.src=svg;await image.decode();
   const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
   canvas.getContext('2d').drawImage(image,0,0,width,height);return canvas.toDataURL('image/png').split(',')[1];
  },{raw,name,width,height});
  const dst=path.join(web,name+'.png');await writeFile(dst,Buffer.from(result,'base64'));
  await copyFile(dst,path.join(native,'card_'+name.replaceAll('-','_')+'.png'));
 }
 for(const [source,name,size] of [['star_04.png','glint',128],['light_01.png','glow',128],['flare_01.png','flare',128]]){
  const raw=await readFile(path.join(root,'design/card-assets/particles',source));
  const png=await page.evaluate(async({data,size})=>{const image=new Image();image.src=data;await image.decode();const c=document.createElement('canvas');c.width=c.height=size;c.getContext('2d').drawImage(image,0,0,size,size);return c.toDataURL('image/png').split(',')[1];},{data:'data:image/png;base64,'+raw.toString('base64'),size});
  const dst=path.join(web,name+'.png');await writeFile(dst,Buffer.from(png,'base64'));await copyFile(dst,path.join(native,'card_'+name+'.png'));
 }
 console.log('Подготовлено 5 общих ассетов: рамка, медальон, блик, свечение, вспышка.');
}finally{await browser.close();}
