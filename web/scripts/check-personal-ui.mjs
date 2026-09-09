// Локальная визуальная проверка на фикстурах. Ни один API-запрос не уходит
// на настоящий сервер; каталог изображений и компоненты берутся из приложения.
import puppeteer from 'puppeteer';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const base=process.env.CITAVUK_UI_URL||'http://127.0.0.1:5187';
if(new URL(base).hostname!=='127.0.0.1')throw new Error('Проверка только на локальном сервере');
const out=path.join(os.tmpdir(),'citavuk-personal-ui');await mkdir(out,{recursive:true});
const lesson={day:1,revision:1,edited:false,rating:0,unlocked:true,content:{title:'Разговор в книжной лавке',theme:'Книги и общение',kind:'listening',text:'Добар дан! Тражим књигу на српском језику. Да ли имате нешто за почетнике? Волим кратке приче о Београду.',rules:['Вежливую просьбу начинай с «Молим вас».'],scheme:{title:'Три фразы для разговора',columns:['Сербский','Русский'],rows:[['Тражим књигу','Ищу книгу'],['Колико кошта?','Сколько стоит?']]},exercises:Array.from({length:4},(_,i)=>({kind:'translate',question:`Переведи фразу ${i+1}: «Ищу книгу»`,answer:'Tražim knjigu',acceptedAnswers:[],hint:''}))}};
const plan={id:'ui-fixture',profile:{level:'A2',timezone:'Europe/Belgrade',answers:{}},outline:Array.from({length:30},(_,i)=>({day:i+1,title:i===0?lesson.content.title:`Открытие ${i+1}`,kind:'listening',goal:'Общение'})),lessons:[lesson],today:1,month:9,status:'ready',generation:1,regenerations:0,startedAt:'2026-09-09T00:00:00Z',suggestRegeneration:false};
const study={timezone:'Europe/Belgrade',today:'2026-09-09',todayActive:false,current:4,longest:4,activeDays:4,freezes:2,days:[],newDay:false};
const browser=await puppeteer.launch({headless:true});
try{
 for(const width of [1440,390]){
  const page=await browser.newPage();const errors=[];let mode='deck';page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width,height:940,deviceScaleFactor:1});
  await page.evaluateOnNewDocument(()=>{localStorage.setItem('citavuk-token','cookie');});
  await page.setRequestInterception(true);
  page.on('request',async r=>{
   const u=new URL(r.url());
   if(u.pathname.startsWith('/v1/')){
    let body={items:[],unread:0};
    if(u.pathname==='/v1/auth/me')body={id:'ui-test-only',email:'fixture@example.test',displayName:'Проверка интерфейса',serbianLevel:'A2',emailVerified:true,isAdmin:false};
    else if(u.pathname==='/v1/personal')body={available:true,questions:[{id:'goal',title:'Для чего тебе сербский?',multiple:true,options:['Жизнь в Сербии','Работа','Путешествия','Учёба и экзамены','Семья и общение','Культура']},{id:'pace',title:'Какой темп тебе подходит?',options:['Спокойный','Сбалансированный','Интенсивный']}],history:[],plan:mode==='questionnaire'?null:mode==='generating'?{...plan,status:'running',lessons:[],outline:[]}:plan};
    else if(u.pathname.includes('/days/'))body=lesson;
    else if(u.pathname==='/v1/study')body=study;
    else if(u.pathname==='/v1/daily')body={enabled:false,set:null,themes:[],configured:true,progress:{streak:4,dueNow:0,faded:[]}};
    else if(u.pathname.includes('/sync/'))body={changes:[],cursor:0,hasMore:false};
    await r.respond({status:200,contentType:'application/json',body:JSON.stringify(body)});
   }else if(u.origin!==new URL(base).origin && !['data:','blob:'].includes(u.protocol))await r.abort();
   else await r.continue();
  });
  await page.goto(`${base}/personal`,{waitUntil:'networkidle0'});await page.waitForSelector('.personal-card.is-open');
  await page.screenshot({path:path.join(out,`deck-${width}.png`)});
  mode='questionnaire';await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('.personal-options');
  const choices=await page.$$('input[type=checkbox]');
  await choices[0].click();await choices[1].click();
  if(await page.$$eval('input:checked',els=>els.length)!==2)throw new Error('Нет множественного выбора');
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw new Error(`Анкета overflow ${width}`);
  await page.screenshot({path:path.join(out,`questionnaire-${width}.png`),fullPage:true});
  await page.evaluate(()=>document.documentElement.classList.add('dark'));
  await page.screenshot({path:path.join(out,`questionnaire-dark-${width}.png`),fullPage:true});
  await page.evaluate(()=>document.documentElement.classList.remove('dark'));
  mode='generating';await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('.personal-generation');
  await page.screenshot({path:path.join(out,`generating-${width}.png`)});
  mode='deck';await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('.personal-card.is-open');
  await page.click('.personal-card.is-open');await page.waitForSelector('.personal-prose');
  await page.screenshot({path:path.join(out,`lesson-${width}.png`)});
  await page.evaluate(()=>{document.querySelector('.lesson-hero h1').textContent='Падежи: именительный и родительный';});
  await page.screenshot({path:path.join(out,`lesson-long-title-${width}.png`)});
  await page.click('.lesson-chapters a[href="#lesson-practice"]');
  if(new URL(page.url()).hash)throw new Error('Переход внутри урока меняет историю роутера');
  await page.waitForSelector('.lesson-exercise input');
  await page.type('.lesson-exercise input','Tražim knjigu');
  if(await page.$eval('.lesson-answer-count',el=>el.textContent)!=='1 / 4')throw new Error('Не обновился счётчик ответов');
  await page.screenshot({path:path.join(out,`lesson-practice-${width}.png`)});
  await page.evaluate(()=>document.documentElement.classList.add('dark'));
  await page.screenshot({path:path.join(out,`lesson-practice-dark-${width}.png`)});
  await page.evaluate(()=>document.documentElement.classList.remove('dark'));
  if(!await page.$('audio'))throw new Error('Нет озвучки listening');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  if(overflow)throw new Error(`Горизонтальный overflow ${width}`);
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Изменить свой урок'))?.click());
  await page.waitForSelector('textarea');await page.type('textarea',' — моя правка');
  let asked=false;page.on('dialog',async d=>{asked=true;await d.dismiss();});
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('К колоде'))?.click());
  await page.waitForFunction(()=>!!document.querySelector('textarea'));
  if(!asked)throw new Error('Нет защиты несохранённых правок');
  if(errors.length)throw new Error(errors.join('\n'));
  console.log(`OK ${width}px: колода, анкета с множественным выбором, состояние генерации, урок, TTS, редактор, защита ухода`);await page.close();
 }
 console.log(out);
}finally{await browser.close();}
