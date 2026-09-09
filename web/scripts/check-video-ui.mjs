// Изолированная проверка UI и настоящего bridge video-player.js. YouTube и API
// заменены фикстурами; никакие реакции/комментарии не отправляются в production.
import puppeteer from 'puppeteer';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const base=process.env.CITAVUK_UI_URL||'http://127.0.0.1:5188';
assert.equal(new URL(base).hostname,'127.0.0.1');
const out=path.join(os.tmpdir(),'citavuk-video-ui'); await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({headless:true});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try {
 for(const [width,height,signed] of [[1440,940,true],[390,844,true],[360,740,false]]){
  const page=await browser.newPage();const errors=[],events=[],queries=[];let comments=[],failReaction=false;
  const fixtures=Array.from({length:18},(_,n)=>({id:`00000000-0000-4000-8000-${String(n+1).padStart(12,'0')}`,kind:'video',videoId:`testvideo${String(n).padStart(2,'0')}`,videoDuration:30,sourceTitle:n%2?'Ozbiljne Teme':'N1 Srbija',sourceUrl:'https://www.youtube.com/watch?v=testvideo00',titleLatin:`${n+1}. Kako izgleda život u Srbiji: male priče iz Beograda`,titleCyrillic:'Живот у Србији',cefr:'A2',category:'culture',tags:['culture'],reaction:0,likesCount:0,commentsCount:0}));
  await page.setViewport({width,height,hasTouch:width<500,isMobile:width<500});
  page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.stack);});
  await page.evaluateOnNewDocument(s=>{
   if(s)localStorage.setItem('citavuk-token','cookie');
   Object.defineProperty(navigator,'webdriver',{get:()=>false});
  },signed);
  await page.setRequestInterception(true);
  page.on('request',async r=>{
   const u=new URL(r.url());
   if(u.pathname.startsWith('/v1/')){
    let body={items:[],unread:0},status=200;
    if(u.pathname==='/v1/auth/me') {if(signed)body={id:'video-ui-fixture',email:'ui@example.test',displayName:'Проверка',serbianLevel:'A2',emailVerified:true};else {status=401;body={message:'Войди'};}}
    else if(u.pathname==='/v1/micro-feed'){
     queries.push(r.url());const exclude=new Set((u.searchParams.get('exclude')||'').split(','));
     body={items:fixtures.filter(v=>!exclude.has(v.id)).slice(0,8),strategy:'personalized',preferences:{categories:['culture'],cefr:'A2',onboarded:true,levelFromAccount:signed},...(!signed?{visitorToken:'fixture-signed-token'}:{})};
    }else if(u.pathname==='/v1/micro-feed/liked')body={items:fixtures.filter(v=>v.reaction===1)};
    else if(u.pathname.endsWith('/interactions')){
     const payload=JSON.parse(r.postData());events.push(payload);
     const item=fixtures.find(v=>u.pathname.includes(v.id));
     if(failReaction&&payload.event==='like'){status=503;body={message:'Не удалось сохранить'};}
     else{if(item&&['like','dislike','reaction_cleared'].includes(payload.event))item.reaction=payload.event==='like'?1:payload.event==='dislike'?-1:0;status=204;body=null;}
    }else if(u.pathname.endsWith('/comments')){
     if(r.method()==='POST'){body={id:'comment-one',itemId:fixtures[1].id,userId:'video-ui-fixture',author:'Проверка',body:JSON.parse(r.postData()).body,createdAt:new Date().toISOString(),mine:true};comments=[body,...comments];}
     else body={items:comments};
    }else if(u.pathname==='/v1/micro-feed/preferences')body={categories:JSON.parse(r.postData()).categories,cefr:'A2',onboarded:true,levelFromAccount:signed};
    else if(u.pathname.includes('/sync/'))body={books:[],vocabulary:[],reviews:[],palaces:[],changes:[],cursor:0,hasMore:false};
    else if(u.pathname==='/v1/daily')body={enabled:false,set:null,themes:[],configured:true,progress:{streak:0,dueNow:0,faded:[]}};
    else if(u.pathname==='/v1/study')body={timezone:'UTC',today:'2026-09-09',days:[],freezes:2};
    await r.respond({status,contentType:'application/json',body:body===null?'':JSON.stringify(body)});
   }else if(u.href==='https://www.youtube.com/iframe_api'){
    await r.respond({status:200,contentType:'text/javascript',body:`window.YT={Player:class {
      constructor(id,o){this.o=o;this.state=-1;document.getElementById(id).innerHTML='<div style="height:100%;display:grid;place-content:center;text-align:center;background:linear-gradient(155deg,#422a22,#1c1512);color:#efcfab;font:26px Georgia"><p>Život u Srbiji</p><p style="font:14px sans-serif">Локальная фикстура видеоплеера</p></div>';setTimeout(()=>o.events.onReady(),60)}
      getDuration(){return 30}mute(){}unMute(){}playVideo(){this.state=1;this.o.events.onStateChange({data:1})}pauseVideo(){this.state=2;this.o.events.onStateChange({data:2})}
    }};window.onYouTubeIframeAPIReady();`});
   }else if(u.origin!==new URL(base).origin&&!['data:','blob:'].includes(u.protocol))await r.abort();
   else await r.continue();
  });
  await page.goto(`${base}/vukotok/video`,{waitUntil:'networkidle0'});
  await page.waitForSelector('.feed-video-gesture');
  assert.equal(await page.$$eval('.feed-video-screen iframe',e=>e.length),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'overflow');
  await page.screenshot({path:path.join(out,`video-${width}.png`)});
  // Первое нажатие: cookie-сессия без visitor-token тоже отправляет POST.
  await page.click('[aria-label="Нравится"]');
  await page.waitForFunction(()=>document.querySelector('[aria-label="Нравится"]').getAttribute('aria-pressed')==='true');
  assert(events.some(e=>e.event==='like'));assert(queries.length>=2,'нет обновления подбора');
  // Сохранённые видео используют video mode и сохраняют реакцию.
  await page.click('[aria-label="Понравившиеся видео"]');await page.waitForSelector('.feed-video-gesture');
  await page.waitForFunction(()=>document.querySelector('.video-feed-context').textContent.includes('Понравившиеся'));
  await page.click('[aria-label="Вернуться к рекомендациям"]');await page.waitForSelector('.feed-video-gesture');
  const first=await page.$eval('.feed-video-card',e=>e.dataset.videoId);
  await pause(350);
  if(width<500){
   const box=await (await page.$('.feed-video-gesture')).boundingBox();const c=await page.createCDPSession();
   const x=box.x+box.width/2,y=box.y+box.height*.75;
   await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
   await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+3,y:y-110}]});
   await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await c.detach();
  }else{
   const box=await (await page.$('.feed-video-gesture')).boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel({deltaY:140});
  }
  await page.waitForFunction(id=>document.querySelector('.feed-video-card')?.dataset.videoId!==id,{},first);
  await page.waitForSelector('.feed-video-gesture');
  const current=await page.$eval('.feed-video-card',e=>e.dataset.videoId);
  await page.click('[aria-label="Комментарии"]');await page.waitForSelector('[role="dialog"]');
  await page.keyboard.press('ArrowDown');assert.equal(await page.$eval('.feed-video-card',e=>e.dataset.videoId),current);
  await page.waitForSelector('[aria-label="Воспроизвести"]');
  if(signed){await page.type('textarea','Zanimljivo!');await page.click('[aria-label="Отправить"]');await page.waitForFunction(()=>document.querySelector('[role="dialog"]').textContent.includes('Zanimljivo!'));}
  else assert.match(await page.$eval('[role="dialog"]',e=>e.textContent),/Войди/);
  await page.screenshot({path:path.join(out,`comments-${width}.png`)});
  await page.click('[aria-label="Закрыть"]');await page.click('[aria-label="Воспроизвести"]');await page.waitForSelector('.feed-video-gesture');
  // Ошибка реакции не оставляет ложный лайк на экране.
  failReaction=true;await page.click('[aria-label="Нравится"]');await page.waitForSelector('.feed-video-error');
  assert.equal(await page.$eval('[aria-label="Нравится"]',e=>e.getAttribute('aria-pressed')),'false');failReaction=false;
  await page.click('[aria-label="Настроить интересы"]');await page.waitForSelector('[aria-label="Настройка ленты"]');
  await page.click('[aria-label="Закрыть настройки"]');
  await pause(600);await page.keyboard.press('ArrowUp');
  try { await page.waitForFunction(id=>document.querySelector('.feed-video-card')?.dataset.videoId===id,{timeout:5000},first); }
  catch(e){console.log('BACK DEBUG',first,await page.evaluate(()=>({active:document.activeElement?.outerHTML.slice(0,500),video:document.querySelector('.feed-video-card')?.dataset.videoId,dialogs:document.querySelectorAll('[role=dialog]').length,context:document.querySelector('.video-feed-context')?.textContent})));throw e;}
  assert.equal(await page.$$eval('.feed-video-screen iframe',e=>e.length),1);
  assert.deepEqual(errors,[]);console.log(`OK ${width}: ${signed?'cookie без guest-token':'гость'}, жесты, клавиатура, реакции, рекомендации, обсуждение, пауза, настройки`);
  await page.close();
 }
 console.log(out);
}finally{await browser.close();}
