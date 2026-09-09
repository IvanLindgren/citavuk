import puppeteer from 'puppeteer';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const root=path.resolve('../design/card-assets/sources');
const browser=await puppeteer.launch({headless:true});
try{
 const page=await browser.newPage();await page.setViewport({width:1200,height:800});
 const files=['theatre-frame.svg','ravanica.svg'];
 const images=await Promise.all(files.map(async name=>({name,url:'data:image/svg+xml;base64,'+(await readFile(path.join(root,name))).toString('base64')})));
 await page.setContent(`<body style="margin:0;background:#e6dcc8;display:flex;font:20px sans-serif">${images.map(i=>`<figure style="margin:15px;width:370px"><figcaption>${i.name}</figcaption><img style="width:100%;height:680px;object-fit:contain" src="${i.url}"></figure>`).join('')}</body>`);
 await page.evaluate(async()=>{await Promise.all([...document.images].map(i=>i.decode()));});
 const output=path.join(os.tmpdir(),'citavuk-card-sources.png');await page.screenshot({path:output});console.log(output);
}finally{await browser.close();}
