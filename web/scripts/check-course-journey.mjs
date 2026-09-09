// Изолированный визуальный прогон: реальные ассеты и курс, фикстуры аккаунта.
import puppeteer from 'puppeteer';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const base=process.env.CITAVUK_UI_URL||'http://127.0.0.1:5189';
assert.equal(new URL(base).hostname,'127.0.0.1');
const bundle=JSON.parse(await readFile(new URL('../../frontend/assets/course/course_bundle.json',import.meta.url),'utf8'));
const lessons=bundle.units.flatMap(u=>u.skills.flatMap(s=>s.lessons));
const progress={courseId:bundle.courseId,courseVersion:bundle.courseVersion,lessons:Object.fromEntries(lessons.slice(0,5).map(l=>[l.id,{lessonId:l.id,status:'completed',bestScore:1,attemptsCount:1,completedAt:'2026-09-09T12:00:00Z'}])),mastery:{},xp:184,streak:{currentDays:2,longestDays:3,lastStudyDate:'2026-09-09'},activeLesson:null,dialogues:{}};
const out=path.join(os.tmpdir(),'citavuk-course-journey');await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({headless:true});
try{
 for(const width of [1440,390,320]){
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width,height:940,deviceScaleFactor:1});
  await page.evaluateOnNewDocument(()=>{localStorage.setItem('citavuk-token','cookie');localStorage.setItem('citavuk-community-announcement-v1','dismissed');localStorage.setItem('citavuk-daily-seen',new Date().toISOString().slice(0,10));});
  await page.setRequestInterception(true);
  page.on('request',async r=>{
   const u=new URL(r.url());
   if(u.pathname.startsWith('/v1/')){
    let body={items:[],unread:0};
    if(u.pathname==='/v1/auth/me')body={id:'journey-local-test',email:'test@example.test',displayName:'Проверка курса',serbianLevel:'A2',emailVerified:true};
    else if(u.pathname.startsWith('/v1/course/bundle/'))body=bundle;
    else if(u.pathname.startsWith('/v1/course/progress/'))body={courseId:bundle.courseId,payload:progress,updatedAt:'2026-09-09T12:00:00Z'};
    else if(u.pathname==='/v1/study')body={asOf:'2026-09-09T12:00:00Z',timezone:'Europe/Belgrade',today:'2026-09-09',current:2,longest:3,days:[],freezes:2};
    else if(u.pathname.includes('/sync/'))body={books:[],vocabulary:[],reviews:[],palaces:[],cursor:0,hasMore:false};
    await r.respond({status:200,contentType:'application/json',body:JSON.stringify(body)});
   }else if(u.origin!==new URL(base).origin&&!['data:','blob:'].includes(u.protocol))await r.abort();
   else await r.continue();
  });
  await page.goto(`${base}/course`,{waitUntil:'networkidle0'});await page.waitForSelector('.journey-unit');
  await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.$$eval('.journey-node',els=>els.length),lessons.length);
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))console.log('OVERFLOW',await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left< -1)&&getComputedStyle(e).position!=='absolute'}).slice(0,18).map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right}))));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`overflow ${width}`);
  await page.screenshot({path:path.join(out,`hero-${width}.png`)});
  await page.$eval('#chapter-0',el=>el.scrollIntoView({block:'start'}));
  await new Promise(r=>setTimeout(r,700));
  await page.screenshot({path:path.join(out,`path-${width}.png`)});
  const collisions=await page.evaluate(()=>[...document.querySelectorAll('.journey-node')].flatMap(node=>{
   const mascot=node.parentElement.querySelector('.journey-scene-mascot');if(!mascot)return [];
   const a=node.getBoundingClientRect(),b=mascot.getBoundingClientRect();
   return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top?[node.textContent]:[];
  }));
  assert.deepEqual(collisions,[],`маскот перекрывает узлы ${width}`);
  await page.evaluate(()=>document.documentElement.classList.add('dark'));
  await page.screenshot({path:path.join(out,`path-dark-${width}.png`)});
  await page.evaluate(()=>document.querySelector('.journey-index nav a[href="#chapter-2"]').click());
  assert.equal(new URL(page.url()).hash,'','Оглавление не должно менять историю роутера');
  await page.evaluate(()=>document.querySelector('.journey-node>button')?.click());await page.waitForSelector('[role=dialog]');
  assert.match(await page.$eval('[role=dialog]',el=>el.textContent),/знаю|открыть/i);
  await page.keyboard.press('Escape');
  assert.deepEqual(errors,[]);console.log(`OK ${width}: иллюстрации, все уроки, нет пересечений, тёмная тема, подтверждение старта`);
  await page.close();
 }
 console.log(out);
}finally{await browser.close();}
