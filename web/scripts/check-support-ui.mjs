// Только локальные фикстуры, без платежей или изменений production.
import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const base=process.env.CITAVUK_UI_URL||'http://127.0.0.1:5188';
assert.equal(new URL(base).hostname,'127.0.0.1');
const out='../output/support-ui';await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({headless:true});
try {
 for(const [width,height,theme] of [[1440,1000,'light'],[390,844,'light'],[360,740,'dark']]){
  const page=await browser.newPage(),errors=[],moderations=[];
  await page.setViewport({width,height,isMobile:width<500,hasTouch:width<500});
  await page.evaluateOnNewDocument(theme=>{localStorage.setItem('citavuk-theme',theme);localStorage.setItem('citavuk-token','cookie');},theme);
  page.on('pageerror',e=>errors.push(e.message));
  const donations=[false,true].map((showMessage,i)=>({id:`fixture-${i}`,publicName:`Друг ${i}`,showPublic:true,message:'Спасибо за Читавука',showMessage,messageApproved:false,isTest:false,status:'succeeded',amountKopecks:20000,source:'yookassa',paidAt:'2026-10-01T10:00:00Z'}));
  await page.setRequestInterception(true);
  page.on('request',async r=>{
   const u=new URL(r.url());
   if(u.pathname.startsWith('/api/v1/')){
    const route=u.pathname.slice(4);let body={items:[],unread:0,books:[],vocabulary:[],reviews:[],palaces:[],changes:[],cursor:0,hasMore:false};
    if(route==='/v1/auth/me')body={id:'support-ui-admin',email:'admin@example.test',displayName:'Проверка',isAdmin:true,serbianLevel:'A2',emailVerified:true};
    else if(route==='/v1/supporters')body={supporters:[{name:'Первый друг',since:'2026-10-01'},{name:'Второй друг',since:'2026-10-01'}],spotlight:null};
    else if(route==='/v1/admin/overview')body={users:600,onlineNow:0,active24Hours:0,books:0,vocabulary:0,courseLearners:0,publishedCourses:1,openIncidents:0,newUsers:[]};
    else if(route==='/v1/admin/health')body={version:'fixture',database:true,incidents:0,quota:{used:0,limit:0},keys:[]};
    else if(route==='/v1/admin/duel/live')body={people:0,rooms:[],queue:[]};
    else if(route==='/v1/admin/donations')body={month:'2026-10',donations,paidKopecks:40000,refundKopecks:0,paymentEnabled:true};
    else if(route.endsWith('/message')&&r.method()==='PUT'){
     const id=route.split('/').at(-2),request=JSON.parse(r.postData());moderations.push({id,...request});donations.find(d=>d.id===id).messageApproved=request.approved;
    }
    else if(route.startsWith('/v1/daily'))body={enabled:false,set:null,themes:[],available:[],level:'A2',configured:true,progress:{streak:0,dueNow:0,faded:[]}};
    else if(route==='/v1/study')body={timezone:'UTC',today:'2026-10-01',days:[],freezes:2};
    await r.respond({status:200,contentType:'application/json',body:JSON.stringify(body)});return;
   }
   if(u.origin!==new URL(base).origin&&!['data:','blob:'].includes(u.protocol))await r.abort();else await r.continue();
  });
  await page.goto(base,{waitUntil:'networkidle0'});
  await page.waitForSelector('.support-news-card');
  await page.evaluate(async()=>{await document.fonts.ready;document.querySelector('.support-news-card').scrollIntoView({block:'center'});});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.equal(await page.$eval('.support-news-action',e=>e.getAttribute('href')),'/support');
  assert.doesNotMatch(await page.$eval('.support-news-card',e=>e.textContent),/[.·•—–]|--/);
  await (await page.$('.support-news-card')).screenshot({path:`${out}/news-${width}-${theme}.png`});
  await page.goto(`${base}/admin`,{waitUntil:'networkidle0'});
  await page.waitForSelector('nav[aria-label="Разделы админки"]');
  await page.evaluate(()=>[...document.querySelectorAll('nav[aria-label="Разделы админки"] button')].find(b=>b.textContent==='Поддержка').click());
  await page.waitForFunction(()=>document.body.textContent.includes('Только разработчику, автор не разрешил публикацию'));
  assert.equal(await page.$$eval('tbody button',b=>b.filter(e=>e.textContent==='Разрешить публикацию').length),1);
  await page.evaluate(()=>[...document.querySelectorAll('tbody button')].find(b=>b.textContent==='Разрешить публикацию').click());
  await page.waitForFunction(()=>document.body.textContent.includes('Публикация разрешена'));
  assert.deepEqual(moderations,[{id:'fixture-1',approved:true}]);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:`${out}/moderation-${width}-${theme}.png`});
  console.log(`OK ${width} ${theme}: support news, privacy labels, consenting message approval, no JS errors`);
  await page.close();
 }
}finally{await browser.close();}
