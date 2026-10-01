// Локальные книги и подменённый API, без доступа к данным настоящих читателей.
import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const base='http://127.0.0.1:5188';
await mkdir('../output/anna-book-20261001',{recursive:true});
const browser=await puppeteer.launch({headless:true});
try{
 for(const width of [1440,390]){
  const context=await browser.createBrowserContext();const page=await context.newPage();const errors=[],requests=[];
  await page.setViewport({width,height:900,isMobile:width<500,hasTouch:width<500});
  page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);
  page.on('request',async r=>{
   const u=new URL(r.url());
   if(u.origin===base&&u.pathname==='/__qa_seed'){
    await r.respond({status:200,contentType:'text/html',body:'<!doctype html><title>Локальные данные проверки</title>'});return;
   }
   if(u.pathname.startsWith('/api/')){
    const route=u.pathname.slice(4);let body={items:[],unread:0,books:[],vocabulary:[],reviews:[],palaces:[],quotes:[],rev:0,hasMore:false};
    if(route==='/v1/auth/me')body={id:'fixture-account-a',email:'reader@example.test',displayName:'Проверка',serbianLevel:'A2',emailVerified:true};
    else if(route==='/v1/sync/push'){requests.push({kind:'push',body:JSON.parse(r.postData())});body={rev:0};}
    else if(route==='/v1/sync/content/check')body={present:{}};
    else if(route.startsWith('/v1/sync/content/')&&r.method()==='PUT'){requests.push({kind:'content'});body={};}
    else if(route==='/v1/daily')body={set:{id:'fixture-day',day:'2026-10-01',level:'A2',words:[{lemma:'књига',translation:'книга',theme:'Учёба'}],learned:[]},level:'A2',themes:['Учёба'],enabled:true,configured:true,progress:{reviewedToday:0,dueNow:0,words:0,strong:0,faded:[],streak:0},lessonReady:false,canCompose:false};
    else if(route==='/v1/supporters')body={supporters:[],spotlight:null};
    else if(route==='/v1/study')body={today:'2026-10-01',timezone:'UTC',days:[],freezes:0};
    await r.respond({status:200,contentType:'application/json',body:JSON.stringify(body)});return;
   }
   if(u.origin!==base&&!['data:','blob:'].includes(u.protocol))await r.abort();else await r.continue();
  });
  await page.goto(base+'/__qa_seed',{waitUntil:'networkidle0'});
  const recovered=await page.evaluate(async()=>{
   const db=await import('/src/lib/db.ts');const books=await import('/src/lib/books.ts');
   const guest=await import('/src/lib/guestBooks.ts');const quotes=await import('/src/lib/readerQuotes.ts');
   await db.activateGuestStorage();
   const a=await books.importParagraphs('Первая книга',['Вук чита књигу. '.repeat(500)]);
   await books.importParagraphs('Вторая книга',['Друга књига.']);await books.saveProgress(a.id,0,2050);
   await quotes.saveReaderQuote({bookId:a.id,page:0,paragraph:0,start:0,end:3,text:'Вук'});
   await db.activateAccountStorage('fixture-account-a');
   const offered=await guest.listGuestBooks('fixture-account-a');
   const before=(await books.listBooks()).length;
   await guest.copyGuestBooks('fixture-account-a',[a.id]);await guest.copyGuestBooks('fixture-account-a',[a.id]);
   const copied=await books.listBooks(),copiedQuotes=await quotes.listReaderQuotes(copied[0].id);
   const originalCount=await (async()=>{await db.activateGuestStorage();return (await books.listBooks()).length;})();
   await db.activateAccountStorage('fixture-account-b');let rejected=false;
   try{await guest.copyGuestBooks('fixture-account-a',[a.id]);}catch{rejected=true;}
   const foreignCount=(await books.listBooks()).length;
   await db.activateAccountStorage('fixture-account-a');localStorage.setItem('citavuk-token','cookie');
   localStorage.setItem('citavuk-daily-seen',new Date().toISOString().slice(0,10));
   return {offered:offered.length,before,copied:copied.length,offset:copied[0].lastOffset,newId:copied[0].id!==a.id,quotes:copiedQuotes.length,originalCount,rejected,foreignCount};
  });
  assert.deepEqual(recovered,{offered:2,before:0,copied:1,offset:2050,newId:true,quotes:1,originalCount:2,rejected:true,foreignCount:0});
  await page.goto(base+'/library',{waitUntil:'networkidle0'});
  await page.waitForFunction(()=>document.body.textContent.includes('Книги из этого браузера'));
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Выбрать книги').click());
  await page.evaluate(()=>{const panel=[...document.querySelectorAll('h2')].find(h=>h.textContent==='Книги из этого браузера').parentElement;panel.querySelector('input[type=checkbox]').click();});
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Добавить в мой аккаунт').click());
  await page.waitForFunction(()=>![...document.querySelectorAll('h2')].some(h=>h.textContent==='Книги из этого браузера'));
  assert.ok(requests.find(r=>r.kind==='push'&&r.body.books.some(b=>b.lastOffset===2050)));
  assert.equal(requests[0].kind,'push');assert.ok(requests.some(r=>r.kind==='content'));
  await page.click(width>1000?'button[aria-controls="header-more-panel"]':'button[aria-label="Открыть меню"]');
  const selector=width>1000?'#header-more-panel a[href="/daily"]':'nav[aria-label="Разделы Читавука"] a[href="/daily"]';
  await page.waitForSelector(selector);await page.click(selector);
  await page.waitForFunction(()=>document.querySelector('[aria-label="На каждый день"]')?.textContent.includes('књига'));
  assert.equal(await page.$$eval('[aria-label="На каждый день"]',els=>els.length),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.deepEqual(errors,[]);await page.screenshot({path:`../output/anna-book-20261001/ui-${width}.png`});
  console.log(`OK ${width}: selected guest copy, quotes, account isolation, offset sync, daily menu`);
  await context.close();
 }
}finally{await browser.close();}
