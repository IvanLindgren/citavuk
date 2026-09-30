// Воспроизведение и API подменены, книга только в локальном IndexedDB.
import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const base='http://127.0.0.1:5188',out='../output/reader-audio-ui';await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({headless:true});
try{
 for(const flow of ['pages','scroll']){
  const page=await browser.newPage(),errors=[];
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  await page.evaluateOnNewDocument(flow=>{
   localStorage.setItem('citavuk-reader-settings',JSON.stringify({flow,font:'sans',fontSize:24,audioFollow:false}));
   window.__audios=[];
   window.Audio=class extends EventTarget{
    paused=true;ended=false;duration=10;currentTime=0;playbackRate=1;
    constructor(){super();window.__audios.push(this);}
    play(){this.paused=false;this.onplay?.();return Promise.resolve();}
    pause(){this.paused=true;this.onpause?.();}
   };
  },flow);
  page.on('pageerror',e=>errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request',async r=>{
   const u=new URL(r.url());
   if(u.pathname.startsWith('/api/')){
    let body={items:[],unread:0,enabled:false,themes:[],available:[],level:'A2',configured:true,supporters:[],spotlight:null};
    if(u.pathname.includes('/analy'))body=[];
    if(u.pathname.endsWith('/study'))body={timezone:'UTC',today:'2026-10-01',days:[],freezes:2};
    await r.respond({status:u.pathname.endsWith('/auth/me')?401:200,contentType:'application/json',body:JSON.stringify(body)});
   }else if(u.origin!==base&&!['data:','blob:'].includes(u.protocol))await r.abort();else await r.continue();
  });
  await page.goto(base,{waitUntil:'networkidle0'});
  await page.evaluate(async()=>{
   const {saveBook}=await import('/src/lib/books.ts');
   const now=Date.now(),paragraphs=['Čitam knjigu i slušam srpski jezik. '.repeat(38),'Ovo je druga stranica knjige. '.repeat(38)];
   await saveBook({id:'reader-audio-ui',title:'Проверка озвучки',sourceKey:'fixture',folder:'',paragraphCount:2,lastParagraph:0,contentSha:'',textMissing:false,addedAt:now,updatedAt:now,dirty:0,deleted:0},paragraphs);
  });
  await page.goto(`${base}/reader/reader-audio-ui`,{waitUntil:'networkidle0'});
  await page.waitForSelector('button[title="Аудиокнига"]');
  await page.click('button[title="Аудиокнига"]');await page.waitForSelector('[aria-label="Пауза"]');
  await page.evaluate(()=>window.scrollTo(0,650));await new Promise(r=>setTimeout(r,350));
  const top=await page.evaluate(()=>scrollY);assert(top>100,'фикстура должна быть прокручена');
  for(let i=0;i<3;i++){await page.evaluate(()=>window.__audios.at(-1).onended());await new Promise(r=>setTimeout(r,100));}
  assert(Math.abs(await page.evaluate(()=>scrollY)-top)<3,'фразы перемотали страницу вверх');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.evaluate(()=>[...document.querySelectorAll('label')].find(e=>e.textContent.includes('Автопрокрутка при озвучке')).querySelector('input').click());
  await new Promise(r=>setTimeout(r,150));
  assert(Math.abs(await page.evaluate(()=>scrollY)-top)<3,'переключатель восстановил аудиопозицию заново');
  await page.evaluate(()=>window.__audios.at(-1).onended());await new Promise(r=>setTimeout(r,150));
  assert(Math.abs(await page.evaluate(()=>scrollY)-top)<3,'тот же лист перемотан при включённом следовании');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('citavuk-reader-settings')).audioFollow),true);
  await page.screenshot({path:`${out}/${flow}-390.png`});
  assert.deepEqual(errors,[]);console.log(`OK ${flow}: repeated sentences preserve scroll, follow toggle persists, no JS errors or overflow`);
  await page.close();
 }
}finally{await browser.close();}
